"""Trains the recommender on MovieLens, evaluates it and exports what the website needs.

Model: matrix factorization with implicit feedback (ALS, Hu, Koren and Volinsky 2008).
Every rating counts as "watched it"; the stars only raise the confidence of that signal.

It is measured in two scenarios:
  A. Person with history: we hide 20% of what they watched and check whether the model finds it.
  B. New person: picks 5 movies they liked (like on the website) and we check if we get the rest right.

And it exports two modes for the website:
  - "accurate": gets more right, but leans toward famous classics.
  - "similar": gets slightly fewer right, but recommends things closer to what you picked.

Usage:
  .venv/bin/python -I model/train.py model/raw_data/ml-latest-small data

Writes to that folder:
  movies.json       titles, genres, parameters, metrics and scales
  recommender.bin   movie vectors in binary (int8) and the 2D map (uint16)
"""
import csv
import json
import re
import sys
import time
from collections import defaultdict
from itertools import product
from pathlib import Path

import numpy as np

DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUTPUT = Path(sys.argv[2]) if len(sys.argv) > 2 else None

MIN_RATINGS = 10          # movies with fewer ratings are left out: too little signal
ITERATIONS = 15
TOP_K = 10                # how many recommendations are evaluated per person
RELEVANT_THRESHOLD = 4.0  # "liked it" = rated 4 or higher
SEED = 7
ALPHA_NEW = 20.0          # confidence given to each movie picked by a new person
SIMILAR_PARAMS = (64, 10.0, 5.0)   # k, λ, α for the "similar" mode (chosen in a separate test)


# ---------- 1. Load data ----------
def load():
    rows = []
    with open(DATA / "ratings.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append((int(r["userId"]), int(r["movieId"]), float(r["rating"])))
    movies = {}
    with open(DATA / "movies.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            title, year = r["title"].strip(), None
            if title.endswith(")") and title[-6:-5] == "(" and title[-5:-1].isdigit():
                title, year = title[:-7].strip(), int(title[-5:-1])
            movies[int(r["movieId"])] = (title, year, r["genres"])
    return rows, movies


# ---------- 2. Model: implicit ALS ----------
def solve_side(rows, F, lam, alpha):
    """Fixes one side (F) and solves the other with least squares. Half of one ALS iteration."""
    k = F.shape[1]
    FtF = F.T @ F
    reg = lam * np.eye(k)
    out = np.zeros((len(rows), k))
    for i, (idx, r) in enumerate(rows):
        if len(idx) == 0:
            continue
        Fi = F[idx]
        c = 1.0 + alpha * r                       # confidence: more stars, more weight
        A = FtF + (Fi.T * (c - 1.0)) @ Fi + reg
        b = (Fi.T * c).sum(axis=1)
        out[i] = np.linalg.solve(A, b)
    return out


def train(by_user, by_item, k, lam, alpha):
    rng = np.random.default_rng(SEED)
    X = rng.normal(0, 0.01, (len(by_user), k))
    Y = rng.normal(0, 0.01, (len(by_item), k))
    for _ in range(ITERATIONS):
        X = solve_side(by_user, Y, lam, alpha)
        Y = solve_side(by_item, X, lam, alpha)
    return X, Y


def group(interactions, n_users, n_items):
    u_idx, u_r = defaultdict(list), defaultdict(list)
    i_idx, i_r = defaultdict(list), defaultdict(list)
    for u, i, r in interactions:
        u_idx[u].append(i); u_r[u].append(r)
        i_idx[i].append(u); i_r[i].append(r)
    by_user = [(np.array(u_idx[u], dtype=int), np.array(u_r[u])) for u in range(n_users)]
    by_item = [(np.array(i_idx[i], dtype=int), np.array(i_r[i])) for i in range(n_items)]
    return by_user, by_item


# ---------- 3. The two ways to recommend to a new person (the website does the same in JS) ----------
def score_accurate(Y, YtY, lam, picked):
    """Builds the person's taste vector from the movies they picked and scores the whole catalog."""
    k = Y.shape[1]
    c = 1 + ALPHA_NEW * 5
    A = YtY + lam * np.eye(k) + (c - 1) * Y[picked].T @ Y[picked]
    b = c * Y[picked].sum(axis=0)
    return Y @ np.linalg.solve(A, b)


def score_similar(Yn, picked):
    """Sum of the (cosine) similarity to each picked movie."""
    return Yn @ Yn[picked].sum(axis=0)


def normalize(Y):
    return Y / (np.linalg.norm(Y, axis=1, keepdims=True) + 1e-9)


def tsne_2d(Y, perplexity=30.0, iterations=750):
    """Lays the vectors out in 2D with exact t-SNE: movies that are close in the model stay close on the map."""
    n = len(Y)
    D = np.maximum(((Y[:, None, :] - Y[None, :, :]) ** 2).sum(-1), 0)
    P = np.zeros((n, n))
    target = np.log(perplexity)
    for i in range(n):                       # finds each movie's "radius" so it has ~30 effective neighbors
        d = np.delete(D[i], i)
        lo, hi, beta = 0.0, np.inf, 1.0
        for _ in range(60):
            p = np.exp(-(d - d.min()) * beta)
            s = p.sum()
            H = np.log(s) + beta * (d - d.min()) @ p / s
            if abs(H - target) < 1e-5:
                break
            if H > target:
                lo, beta = beta, beta * 2 if hi == np.inf else (beta + hi) / 2
            else:
                hi, beta = beta, (beta + lo) / 2
        P[i, np.arange(n) != i] = p / s
    P = np.maximum((P + P.T) / (2 * n), 1e-12)
    Yc = Y - Y.mean(axis=0)
    Z = Yc @ np.linalg.svd(Yc, full_matrices=False)[2][:2].T
    Z = Z / Z[:, 0].std() * 1e-4
    vel, gains = np.zeros_like(Z), np.ones_like(Z)
    lr = max(n / 12 / 4, 50)
    for it in range(iterations):
        exag = 12.0 if it < 250 else 1.0
        num = 1.0 / (1.0 + ((Z[:, None, :] - Z[None, :, :]) ** 2).sum(-1))
        np.fill_diagonal(num, 0)
        Q = np.maximum(num / num.sum(), 1e-12)
        PQ = (exag * P - Q) * num
        grad = 4 * (np.diag(PQ.sum(axis=1)) - PQ) @ Z
        gains = np.where(np.sign(grad) != np.sign(vel), gains + 0.2, gains * 0.8).clip(0.01)
        vel = (0.5 if it < 250 else 0.8) * vel - lr * gains * grad
        Z = Z + vel
        Z -= Z.mean(axis=0)
    return (Z - Z.min(axis=0)) / (Z.max(axis=0) - Z.min(axis=0))


def quantize(Y):
    """Stores each number in 1 byte (int8) instead of 8. Returns the integers and the scale to recover them."""
    scale = float(np.abs(Y).max() / 127)
    return np.round(Y / scale).astype(np.int8), scale


def readable_title(t):
    """MovieLens writes 'Matrix, The'; we turn it into 'The Matrix'."""
    m = re.match(r"^(.*?), (The|A|An|Les|La|Le|L'|Il|El|Das|Der|Die)(\s*\(.*\))?$", t)
    if not m:
        return t
    article = m.group(2)
    return f"{article}{'' if article.endswith(chr(39)) else ' '}{m.group(1)}{m.group(3) or ''}"


# ---------- 4. Evaluation ----------
def top_k(s, exclude):
    s = s.astype(float).copy()
    s[list(exclude)] = -np.inf
    return np.argpartition(-s, TOP_K)[:TOP_K]


def summary(precisions, recalls, recommended, n_items):
    return {
        "precision_at_10": round(float(np.mean(precisions)), 4),
        "recall_at_10": round(float(np.mean(recalls)), 4),
        "catalog_coverage": round(len(recommended) / n_items, 4),
        "people_evaluated": len(precisions),
    }


def evaluate_history(score, seen, test, n_items):
    P, R, recs = [], [], set()
    for u, items in test.items():
        relevant = {i for i, r in items if r >= RELEVANT_THRESHOLD}
        if not relevant:
            continue
        top = top_k(score(u), seen[u])
        hits = len(relevant.intersection(top.tolist()))
        P.append(hits / TOP_K); R.append(hits / len(relevant)); recs.update(top.tolist())
    return summary(P, R, recs, n_items)


def evaluate_new(score, cases, n_items):
    P, R, recs = [], [], set()
    for picked, relevant in cases:
        top = top_k(score(picked), picked)
        hits = len(relevant.intersection(top.tolist()))
        P.append(hits / TOP_K); R.append(hits / len(relevant)); recs.update(top.tolist())
    return summary(P, R, recs, n_items)


def main():
    t0 = time.time()
    rows, movies = load()

    count = defaultdict(int)
    for _, m, _ in rows:
        count[m] += 1
    rows = [f for f in rows if count[f[1]] >= MIN_RATINGS]
    users = sorted({u for u, _, _ in rows})
    items = sorted({m for _, m, _ in rows})
    u_pos = {u: n for n, u in enumerate(users)}
    i_pos = {m: n for n, m in enumerate(items)}
    data = [(u_pos[u], i_pos[m], r) for u, m, r in rows]
    n_u, n_i = len(users), len(items)
    rng = np.random.default_rng(SEED)
    print(f"{len(data):,} ratings · {n_u} people · {n_i} movies (with ≥{MIN_RATINGS} ratings)")

    # ===== A. Person with history =====
    # Split per person: 70% train, 10% validation (to choose parameters), 20% final test
    by_u = defaultdict(list)
    for u, i, r in data:
        by_u[u].append((i, r))
    tr, val, test = [], defaultdict(list), defaultdict(list)
    for u, lst in by_u.items():
        order = rng.permutation(len(lst))
        n_t, n_v = int(len(lst) * 0.2), int(len(lst) * 0.1)
        for pos, j in enumerate(order):
            i, r = lst[j]
            if pos < n_t:
                test[u].append((i, r))
            elif pos < n_t + n_v:
                val[u].append((i, r))
            else:
                tr.append((u, i, r))

    def seen_in(inter):
        v = defaultdict(set)
        for u, i, _ in inter:
            v[u].add(i)
        return v

    print("\nA. Parameter search (validation, person with history):")
    pu, pi = group(tr, n_u, n_i)
    seen_tr = seen_in(tr)
    results = []
    for k, lam, alpha in product((16, 32, 64), (1.0, 10.0, 50.0), (1.0, 5.0, 20.0)):
        X, Y = train(pu, pi, k, lam, alpha)
        m = evaluate_history(lambda u: Y @ X[u], seen_tr, val, n_i)
        results.append(((k, lam, alpha), m))
        print(f"  k={k:<3} λ={lam:<5} α={alpha:<5} → precision@10 {m['precision_at_10']:.4f}")
    accurate_params, _ = max(results, key=lambda x: x[1]["precision_at_10"])
    k, lam, alpha = accurate_params
    print(f"  Best: k={k}, λ={lam}, α={alpha}")

    tr_val = tr + [(u, i, r) for u, lst in val.items() for i, r in lst]
    pu, pi = group(tr_val, n_u, n_i)
    X, Y = train(pu, pi, k, lam, alpha)
    popularity = np.zeros(n_i)
    for _, i, _ in tr_val:
        popularity[i] += 1
    seen_tv = seen_in(tr_val)
    history = {
        "model": evaluate_history(lambda u: Y @ X[u], seen_tv, test, n_i),
        "popularity": evaluate_history(lambda u: popularity, seen_tv, test, n_i),
    }
    print("A. Final test (person with history):")
    for name, m in history.items():
        print(f"  {name:<12} {m}")

    # ===== B. New person who picks 5 movies =====
    # 20% of people are not used for training; for each one we take 5 movies they liked
    new_people = set(rng.permutation(n_u)[: int(n_u * 0.2)].tolist())
    tr_b = [d for d in data if d[0] not in new_people]
    cases = []
    for u in sorted(new_people):
        liked = [i for i, r in by_u[u] if r >= RELEVANT_THRESHOLD]
        if len(liked) < 8:
            continue
        picked = rng.choice(liked, 5, replace=False).tolist()
        cases.append((picked, set(liked) - set(picked)))
    pop_b = np.zeros(n_i)
    for _, i, _ in tr_b:
        pop_b[i] += 1
    pu, pi = group(tr_b, n_u, n_i)
    _, Ya = train(pu, pi, k, lam, alpha)
    _, Ys = train(pu, pi, *SIMILAR_PARAMS)
    YtYa, Ysn = Ya.T @ Ya, normalize(Ys)
    new_m = {
        "accurate": evaluate_new(lambda e: score_accurate(Ya, YtYa, lam, e), cases, n_i),
        "similar": evaluate_new(lambda e: score_similar(Ysn, e), cases, n_i),
        "popularity": evaluate_new(lambda e: pop_b, cases, n_i),
    }
    print(f"\nB. New person with 5 movies ({len(cases)} people the model never saw):")
    for name, m in new_m.items():
        print(f"  {name:<12} {m}")

    # How much is lost by storing the vectors in 1 byte, the way the website reads them?
    qa, sa = quantize(Ya); Yaq = qa * sa
    qs, ss = quantize(Ysn); Ysq = qs * ss
    YtYq = Yaq.T @ Yaq
    web_format = {
        "accurate": evaluate_new(lambda e: score_accurate(Yaq, YtYq, lam, e), cases, n_i),
        "similar": evaluate_new(lambda e: score_similar(Ysq, e), cases, n_i),
    }
    print("  With the vectors in 1 byte (web format):")
    for name, m in web_format.items():
        print(f"  {name:<12} {m}")

    # ===== Final models trained on all the data, for the website =====
    pu, pi = group(data, n_u, n_i)
    _, Ya = train(pu, pi, k, lam, alpha)
    _, Ys = train(pu, pi, *SIMILAR_PARAMS)
    Ysn = normalize(Ys)

    # 2D map of the movies (t-SNE of the "similar" mode vectors)
    t1 = time.time()
    map2d = tsne_2d(Ysn)
    print(f"2D map (t-SNE) in {time.time() - t1:.0f} s")
    # Does the map respect genres the model never saw? Nearest neighbors that share the first genre
    genre = [movies[m][2].split("|")[0] for m in items]
    dm = ((map2d[:, None, :] - map2d[None, :, :]) ** 2).sum(-1)
    np.fill_diagonal(dm, np.inf)
    neighbors = np.argsort(dm, axis=1)[:, :5]
    same = np.mean([[genre[v] == genre[i] for v in neighbors[i]] for i in range(n_i)])
    chance = np.mean([np.mean([g == genre[i] for g in genre]) for i in range(n_i)])
    print(f"Map neighbors sharing the first genre: {same:.1%} (by chance: {chance:.1%})")

    # Web format: int8 vectors and uint16 map in one binary file; everything else in JSON
    qa, sa = quantize(Ya); Yaq = qa * sa
    qs, ss = quantize(Ysn); Ysq = qs * ss
    map_u16 = np.round(map2d * 65535).astype("<u2")

    # Check: what the website must recommend for this profile (the website compares it when loaded in test mode)
    profile = ("Matrix, The", "Alien", "Terminator 2: Judgment Day", "Inception", "Blade Runner")
    e = [i_pos[m] for m in items if movies[m][0] in profile]
    rank = lambda s: [int(items[j]) for j in top_k(s, e)[np.argsort(-s[top_k(s, e)])]]
    check = {
        "profile": [items[i] for i in e],
        "accurate": rank(score_accurate(Yaq, Yaq.T @ Yaq, lam, e)),
        "similar": rank(score_similar(Ysq, e)),
    }

    OUTPUT.mkdir(parents=True, exist_ok=True)
    meta = {
        "source": "MovieLens ml-latest-small (GroupLens Research, University of Minnesota). F. Maxwell Harper and Joseph A. Konstan, 2015.",
        "model": "Implicit ALS (Hu, Koren and Volinsky, 2008)",
        "params": {
            "accurate": {"k": k, "lambda": lam, "alpha": alpha, "alpha_new": ALPHA_NEW},
            "similar": dict(zip(("k", "lambda", "alpha"), SIMILAR_PARAMS)),
            "iterations": ITERATIONS, "min_ratings": MIN_RATINGS,
        },
        "metrics": {
            "person_with_history": history,
            "new_person": new_m,
            "new_person_web_format": web_format,
            "people": n_u, "ratings": len(data),
            "map_neighbors_same_genre": round(float(same), 4), "map_chance_same_genre": round(float(chance), 4),
        },
        "binary": {"n": n_i, "order": ["map uint16 n×2", "accurate int8 n×k", "similar int8 n×k"],
                   "scale_accurate": sa, "scale_similar": ss},
        "items": [[m, readable_title(movies[m][0]), movies[m][1], movies[m][2], count[m]] for m in items],
        "check": check,
    }
    (OUTPUT / "movies.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUTPUT / "recommender.bin").write_bytes(map_u16.tobytes() + qa.tobytes() + qs.tobytes())
    for f in ("movies.json", "recommender.bin"):
        print(f"Exported {OUTPUT / f} ({(OUTPUT / f).stat().st_size / 1024:.0f} KB)")
    print(f"Done in {time.time() - t0:.0f} s")

    title = {m: readable_title(movies[m][0]) for m in items}
    print("\nCheck (science fiction):")
    for mode in ("accurate", "similar"):
        print(f"  {mode:<8} → {[title[m] for m in check[mode]][:6]}")


if __name__ == "__main__":
    main()
