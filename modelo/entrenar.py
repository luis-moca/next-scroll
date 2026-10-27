"""Entrena el recomendador con MovieLens, lo evalúa y exporta lo que necesita la web.

Modelo: factorización de matrices con retroalimentación implícita (ALS, Hu, Koren y Volinsky 2008).
Cada calificación cuenta como "lo vio"; las estrellas solo suben la confianza de esa señal.

Se mide en dos escenarios:
  A. Persona con historial: le escondemos 20% de lo que vio y vemos si el modelo lo encuentra.
  B. Persona nueva: elige 5 películas que le gustaron (como en la web) y vemos si acertamos el resto.

Y se exportan dos modos para la web:
  - "preciso": acierta más, pero tira a clásicos famosos.
  - "parecido": acierta un poco menos, pero recomienda cosas más cercanas a lo que elegiste.

Uso:
  .venv/bin/python -I modelo/entrenar.py modelo/datos_crudos/ml-latest-small data

Escribe en esa carpeta:
  peliculas.json    títulos, géneros, parámetros, métricas y escalas
  recomendador.bin  vectores de las películas en binario (int8) y el mapa 2D (uint16)
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

DATOS = Path(sys.argv[1]) if len(sys.argv) > 1 else None
SALIDA = Path(sys.argv[2]) if len(sys.argv) > 2 else None

MIN_CALIFICACIONES = 10   # películas con menos calificaciones se quedan fuera: hay muy poca señal
ITERACIONES = 15
TOP_K = 10                # cuántas recomendaciones se evalúan por persona
UMBRAL_RELEVANTE = 4.0    # "le gustó" = calificó 4 o más
SEMILLA = 7
ALPHA_NUEVO = 20.0        # confianza que se le da a cada película elegida por una persona nueva
PARAMS_PARECIDO = (64, 10.0, 5.0)   # k, λ, α del modo "parecido" (elegidos en una prueba aparte)


# ---------- 1. Cargar datos ----------
def cargar():
    filas = []
    with open(DATOS / "ratings.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            filas.append((int(r["userId"]), int(r["movieId"]), float(r["rating"])))
    peliculas = {}
    with open(DATOS / "movies.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            titulo, anio = r["title"].strip(), None
            if titulo.endswith(")") and titulo[-6:-5] == "(" and titulo[-5:-1].isdigit():
                titulo, anio = titulo[:-7].strip(), int(titulo[-5:-1])
            peliculas[int(r["movieId"])] = (titulo, anio, r["genres"])
    return filas, peliculas


# ---------- 2. Modelo: ALS implícito ----------
def resolver_lado(filas, F, lam, alpha):
    """Fija un lado (F) y resuelve el otro con mínimos cuadrados. Es la mitad de una iteración de ALS."""
    k = F.shape[1]
    FtF = F.T @ F
    reg = lam * np.eye(k)
    salida = np.zeros((len(filas), k))
    for i, (idx, r) in enumerate(filas):
        if len(idx) == 0:
            continue
        Fi = F[idx]
        c = 1.0 + alpha * r                       # confianza: más estrellas, más peso
        A = FtF + (Fi.T * (c - 1.0)) @ Fi + reg
        b = (Fi.T * c).sum(axis=1)
        salida[i] = np.linalg.solve(A, b)
    return salida


def entrenar(por_usuario, por_item, k, lam, alpha):
    rng = np.random.default_rng(SEMILLA)
    X = rng.normal(0, 0.01, (len(por_usuario), k))
    Y = rng.normal(0, 0.01, (len(por_item), k))
    for _ in range(ITERACIONES):
        X = resolver_lado(por_usuario, Y, lam, alpha)
        Y = resolver_lado(por_item, X, lam, alpha)
    return X, Y


def agrupar(interacciones, n_usuarios, n_items):
    u_idx, u_r = defaultdict(list), defaultdict(list)
    i_idx, i_r = defaultdict(list), defaultdict(list)
    for u, i, r in interacciones:
        u_idx[u].append(i); u_r[u].append(r)
        i_idx[i].append(u); i_r[i].append(r)
    por_usuario = [(np.array(u_idx[u], dtype=int), np.array(u_r[u])) for u in range(n_usuarios)]
    por_item = [(np.array(i_idx[i], dtype=int), np.array(i_r[i])) for i in range(n_items)]
    return por_usuario, por_item


# ---------- 3. Las dos formas de recomendar a una persona nueva (la web hace lo mismo en JS) ----------
def puntaje_preciso(Y, YtY, lam, elegidas):
    """Calcula el vector de gustos de la persona con las películas que eligió y puntúa todo el catálogo."""
    k = Y.shape[1]
    c = 1 + ALPHA_NUEVO * 5
    A = YtY + lam * np.eye(k) + (c - 1) * Y[elegidas].T @ Y[elegidas]
    b = c * Y[elegidas].sum(axis=0)
    return Y @ np.linalg.solve(A, b)


def puntaje_parecido(Yn, elegidas):
    """Suma de la similitud (coseno) con cada película elegida."""
    return Yn @ Yn[elegidas].sum(axis=0)


def normalizar(Y):
    return Y / (np.linalg.norm(Y, axis=1, keepdims=True) + 1e-9)


def tsne_2d(Y, perplejidad=30.0, iteraciones=750):
    """Acomoda los vectores en 2D con t-SNE exacto: películas cercanas en el modelo quedan cercanas en el mapa."""
    n = len(Y)
    D = np.maximum(((Y[:, None, :] - Y[None, :, :]) ** 2).sum(-1), 0)
    P = np.zeros((n, n))
    meta = np.log(perplejidad)
    for i in range(n):                       # busca el "radio" de cada película para tener ~30 vecinos efectivos
        d = np.delete(D[i], i)
        lo, hi, beta = 0.0, np.inf, 1.0
        for _ in range(60):
            p = np.exp(-(d - d.min()) * beta)
            s = p.sum()
            H = np.log(s) + beta * (d - d.min()) @ p / s
            if abs(H - meta) < 1e-5:
                break
            if H > meta:
                lo, beta = beta, beta * 2 if hi == np.inf else (beta + hi) / 2
            else:
                hi, beta = beta, (beta + lo) / 2
        P[i, np.arange(n) != i] = p / s
    P = np.maximum((P + P.T) / (2 * n), 1e-12)
    Yc = Y - Y.mean(axis=0)
    Z = Yc @ np.linalg.svd(Yc, full_matrices=False)[2][:2].T
    Z = Z / Z[:, 0].std() * 1e-4
    vel, ganancia = np.zeros_like(Z), np.ones_like(Z)
    lr = max(n / 12 / 4, 50)
    for it in range(iteraciones):
        exag = 12.0 if it < 250 else 1.0
        num = 1.0 / (1.0 + ((Z[:, None, :] - Z[None, :, :]) ** 2).sum(-1))
        np.fill_diagonal(num, 0)
        Q = np.maximum(num / num.sum(), 1e-12)
        PQ = (exag * P - Q) * num
        grad = 4 * (np.diag(PQ.sum(axis=1)) - PQ) @ Z
        ganancia = np.where(np.sign(grad) != np.sign(vel), ganancia + 0.2, ganancia * 0.8).clip(0.01)
        vel = (0.5 if it < 250 else 0.8) * vel - lr * ganancia * grad
        Z = Z + vel
        Z -= Z.mean(axis=0)
    return (Z - Z.min(axis=0)) / (Z.max(axis=0) - Z.min(axis=0))


def cuantizar(Y):
    """Guarda cada número en 1 byte (int8) en vez de 8. Devuelve los enteros y la escala para recuperarlos."""
    escala = float(np.abs(Y).max() / 127)
    return np.round(Y / escala).astype(np.int8), escala


def titulo_legible(t):
    """MovieLens escribe 'Matrix, The'; lo pasamos a 'The Matrix'."""
    m = re.match(r"^(.*?), (The|A|An|Les|La|Le|L'|Il|El|Das|Der|Die)(\s*\(.*\))?$", t)
    if not m:
        return t
    articulo = m.group(2)
    return f"{articulo}{'' if articulo.endswith(chr(39)) else ' '}{m.group(1)}{m.group(3) or ''}"


# ---------- 4. Evaluación ----------
def top_k(s, excluir):
    s = s.astype(float).copy()
    s[list(excluir)] = -np.inf
    return np.argpartition(-s, TOP_K)[:TOP_K]


def resumen(precisiones, recalls, recomendadas, n_items):
    return {
        "precision_at_10": round(float(np.mean(precisiones)), 4),
        "recall_at_10": round(float(np.mean(recalls)), 4),
        "cobertura_catalogo": round(len(recomendadas) / n_items, 4),
        "personas_evaluadas": len(precisiones),
    }


def evaluar_historial(puntaje, vistos, prueba, n_items):
    P, R, recs = [], [], set()
    for u, items in prueba.items():
        relevantes = {i for i, r in items if r >= UMBRAL_RELEVANTE}
        if not relevantes:
            continue
        top = top_k(puntaje(u), vistos[u])
        aciertos = len(relevantes.intersection(top.tolist()))
        P.append(aciertos / TOP_K); R.append(aciertos / len(relevantes)); recs.update(top.tolist())
    return resumen(P, R, recs, n_items)


def evaluar_nuevos(puntaje, casos, n_items):
    P, R, recs = [], [], set()
    for elegidas, relevantes in casos:
        top = top_k(puntaje(elegidas), elegidas)
        aciertos = len(relevantes.intersection(top.tolist()))
        P.append(aciertos / TOP_K); R.append(aciertos / len(relevantes)); recs.update(top.tolist())
    return resumen(P, R, recs, n_items)


def main():
    t0 = time.time()
    filas, peliculas = cargar()

    conteo = defaultdict(int)
    for _, m, _ in filas:
        conteo[m] += 1
    filas = [f for f in filas if conteo[f[1]] >= MIN_CALIFICACIONES]
    usuarios = sorted({u for u, _, _ in filas})
    items = sorted({m for _, m, _ in filas})
    u_pos = {u: n for n, u in enumerate(usuarios)}
    i_pos = {m: n for n, m in enumerate(items)}
    datos = [(u_pos[u], i_pos[m], r) for u, m, r in filas]
    n_u, n_i = len(usuarios), len(items)
    rng = np.random.default_rng(SEMILLA)
    print(f"{len(datos):,} calificaciones · {n_u} personas · {n_i} películas (con ≥{MIN_CALIFICACIONES} calificaciones)")

    # ===== A. Persona con historial =====
    # Separación por persona: 70% entrenar, 10% validar (elegir parámetros), 20% prueba final
    por_u = defaultdict(list)
    for u, i, r in datos:
        por_u[u].append((i, r))
    ent, val, pru = [], defaultdict(list), defaultdict(list)
    for u, lst in por_u.items():
        orden = rng.permutation(len(lst))
        n_p, n_v = int(len(lst) * 0.2), int(len(lst) * 0.1)
        for pos, j in enumerate(orden):
            i, r = lst[j]
            if pos < n_p:
                pru[u].append((i, r))
            elif pos < n_p + n_v:
                val[u].append((i, r))
            else:
                ent.append((u, i, r))

    def vistos_de(inter):
        v = defaultdict(set)
        for u, i, _ in inter:
            v[u].add(i)
        return v

    print("\nA. Búsqueda de parámetros (validación, persona con historial):")
    pu, pi = agrupar(ent, n_u, n_i)
    v_ent = vistos_de(ent)
    resultados = []
    for k, lam, alpha in product((16, 32, 64), (1.0, 10.0, 50.0), (1.0, 5.0, 20.0)):
        X, Y = entrenar(pu, pi, k, lam, alpha)
        m = evaluar_historial(lambda u: Y @ X[u], v_ent, val, n_i)
        resultados.append(((k, lam, alpha), m))
        print(f"  k={k:<3} λ={lam:<5} α={alpha:<5} → precision@10 {m['precision_at_10']:.4f}")
    params_preciso, _ = max(resultados, key=lambda x: x[1]["precision_at_10"])
    k, lam, alpha = params_preciso
    print(f"  Mejor: k={k}, λ={lam}, α={alpha}")

    ent_val = ent + [(u, i, r) for u, lst in val.items() for i, r in lst]
    pu, pi = agrupar(ent_val, n_u, n_i)
    X, Y = entrenar(pu, pi, k, lam, alpha)
    popularidad = np.zeros(n_i)
    for _, i, _ in ent_val:
        popularidad[i] += 1
    v_ev = vistos_de(ent_val)
    historial = {
        "modelo": evaluar_historial(lambda u: Y @ X[u], v_ev, pru, n_i),
        "popularidad": evaluar_historial(lambda u: popularidad, v_ev, pru, n_i),
    }
    print("A. Prueba final (persona con historial):")
    for nombre, m in historial.items():
        print(f"  {nombre:<12} {m}")

    # ===== B. Persona nueva que elige 5 películas =====
    # 20% de las personas no se usan para entrenar; de cada una tomamos 5 que le gustaron
    nuevas = set(rng.permutation(n_u)[: int(n_u * 0.2)].tolist())
    ent_b = [d for d in datos if d[0] not in nuevas]
    casos = []
    for u in sorted(nuevas):
        gustos = [i for i, r in por_u[u] if r >= UMBRAL_RELEVANTE]
        if len(gustos) < 8:
            continue
        elegidas = rng.choice(gustos, 5, replace=False).tolist()
        casos.append((elegidas, set(gustos) - set(elegidas)))
    pop_b = np.zeros(n_i)
    for _, i, _ in ent_b:
        pop_b[i] += 1
    pu, pi = agrupar(ent_b, n_u, n_i)
    _, Yp = entrenar(pu, pi, k, lam, alpha)
    _, Ys = entrenar(pu, pi, *PARAMS_PARECIDO)
    YtYp, Ysn = Yp.T @ Yp, normalizar(Ys)
    nuevas_m = {
        "preciso": evaluar_nuevos(lambda e: puntaje_preciso(Yp, YtYp, lam, e), casos, n_i),
        "parecido": evaluar_nuevos(lambda e: puntaje_parecido(Ysn, e), casos, n_i),
        "popularidad": evaluar_nuevos(lambda e: pop_b, casos, n_i),
    }
    print(f"\nB. Persona nueva con 5 películas ({len(casos)} personas que el modelo nunca vio):")
    for nombre, m in nuevas_m.items():
        print(f"  {nombre:<12} {m}")

    # ¿Cuánto se pierde al guardar los vectores en 1 byte, como los va a leer la web?
    qp, sp = cuantizar(Yp); Ypq = qp * sp
    qs, ss = cuantizar(Ysn); Ysq = qs * ss
    YtYq = Ypq.T @ Ypq
    formato_web = {
        "preciso": evaluar_nuevos(lambda e: puntaje_preciso(Ypq, YtYq, lam, e), casos, n_i),
        "parecido": evaluar_nuevos(lambda e: puntaje_parecido(Ysq, e), casos, n_i),
    }
    print("  Con los vectores en 1 byte (formato web):")
    for nombre, m in formato_web.items():
        print(f"  {nombre:<12} {m}")

    # ===== Modelos finales con todos los datos, para la web =====
    pu, pi = agrupar(datos, n_u, n_i)
    _, Yp = entrenar(pu, pi, k, lam, alpha)
    _, Ys = entrenar(pu, pi, *PARAMS_PARECIDO)
    Ysn = normalizar(Ys)

    # Mapa 2D de las películas (t-SNE de los vectores del modo "parecido")
    t1 = time.time()
    mapa = tsne_2d(Ysn)
    print(f"Mapa 2D (t-SNE) en {time.time() - t1:.0f} s")
    # ¿El mapa respeta géneros que el modelo nunca vio? Vecinos más cercanos que comparten el género principal
    genero = [peliculas[m][2].split("|")[0] for m in items]
    dm = ((mapa[:, None, :] - mapa[None, :, :]) ** 2).sum(-1)
    np.fill_diagonal(dm, np.inf)
    vecinos = np.argsort(dm, axis=1)[:, :5]
    mismo = np.mean([[genero[v] == genero[i] for v in vecinos[i]] for i in range(n_i)])
    azar = np.mean([np.mean([g == genero[i] for g in genero]) for i in range(n_i)])
    print(f"Vecinos en el mapa con el mismo primer género: {mismo:.1%} (al azar: {azar:.1%})")

    # Formato web: vectores en int8 y mapa en uint16, todo en un binario; lo demás en JSON
    qp, sp = cuantizar(Yp); Ypq = qp * sp
    qs, ss = cuantizar(Ysn); Ysq = qs * ss
    mapa_u16 = np.round(mapa * 65535).astype("<u2")

    # Control: lo que la web debe recomendar a este perfil (la web lo compara al cargar en modo prueba)
    perfil = ("Matrix, The", "Alien", "Terminator 2: Judgment Day", "Inception", "Blade Runner")
    e = [i_pos[m] for m in items if peliculas[m][0] in perfil]
    ordenar = lambda s: [int(items[j]) for j in top_k(s, e)[np.argsort(-s[top_k(s, e)])]]
    control = {
        "perfil": [items[i] for i in e],
        "preciso": ordenar(puntaje_preciso(Ypq, Ypq.T @ Ypq, lam, e)),
        "parecido": ordenar(puntaje_parecido(Ysq, e)),
    }

    SALIDA.mkdir(parents=True, exist_ok=True)
    meta = {
        "fuente": "MovieLens ml-latest-small (GroupLens Research, University of Minnesota). F. Maxwell Harper y Joseph A. Konstan, 2015.",
        "modelo": "ALS implícito (Hu, Koren y Volinsky, 2008)",
        "params": {
            "preciso": {"k": k, "lambda": lam, "alpha": alpha, "alpha_nuevo": ALPHA_NUEVO},
            "parecido": dict(zip(("k", "lambda", "alpha"), PARAMS_PARECIDO)),
            "iteraciones": ITERACIONES, "min_calificaciones": MIN_CALIFICACIONES,
        },
        "metricas": {
            "persona_con_historial": historial,
            "persona_nueva": nuevas_m,
            "persona_nueva_formato_web": formato_web,
            "personas": n_u, "calificaciones": len(datos),
            "mapa_vecinos_mismo_genero": round(float(mismo), 4), "mapa_azar_mismo_genero": round(float(azar), 4),
        },
        "binario": {"n": n_i, "orden": ["mapa uint16 n×2", "preciso int8 n×k", "parecido int8 n×k"],
                    "escala_preciso": sp, "escala_parecido": ss},
        "items": [[m, titulo_legible(peliculas[m][0]), peliculas[m][1], peliculas[m][2], conteo[m]] for m in items],
        "control": control,
    }
    (SALIDA / "peliculas.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (SALIDA / "recomendador.bin").write_bytes(mapa_u16.tobytes() + qp.tobytes() + qs.tobytes())
    for f in ("peliculas.json", "recomendador.bin"):
        print(f"Exportado {SALIDA / f} ({(SALIDA / f).stat().st_size / 1024:.0f} KB)")
    print(f"Listo en {time.time() - t0:.0f} s")

    titulo = {m: titulo_legible(peliculas[m][0]) for m in items}
    print("\nControl (ciencia ficción):")
    for modo in ("preciso", "parecido"):
        print(f"  {modo:<8} → {[titulo[m] for m in control[modo]][:6]}")


if __name__ == "__main__":
    main()
