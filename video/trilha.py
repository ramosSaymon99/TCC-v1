"""Trilha sonora original do vídeo "modo de uso" (sintetizada, sem direitos de terceiros).

Uso: python3 trilha.py eventos.json saida.wav
eventos.json vem de `VERSAO=... node render.mjs eventos` (DUR, INICIO, FIM, cortes de tela, balões, toques).
Pop leve a 120 bpm em Fá maior (F–C–Dm–Bb), compasso alinhado ao início do celular, com efeitos
sonoros discretos nos cortes, balões e toques.
"""
import json
import sys

import numpy as np

SR = 44100
BPM = 120
BAT = 60 / BPM          # 0,5 s
COMP = 4 * BAT          # 2 s
rng = np.random.default_rng(7)

ev = json.load(open(sys.argv[1]))
DUR, INICIO, FIM = ev['DUR'], ev['INICIO'], ev['FIM']
N = int(DUR * SR)
mix = {k: np.zeros(N) for k in ('bateria', 'baixo', 'pad', 'arpejo', 'melodia', 'sfx')}


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def soma(trilha, t0, sinal, ganho=1.0):
    i = int(t0 * SR)
    if i >= N or i + len(sinal) <= 0:
        return
    if i < 0:
        sinal, i = sinal[-i:], 0
    f = min(N, i + len(sinal))
    mix[trilha][i:f] += sinal[: f - i] * ganho


def tempo(d):
    return np.arange(int(d * SR)) / SR


# ---------- instrumentos ----------
def marimba(m, d=0.45, brilho=1.0):
    t = tempo(d)
    f = hz(m)
    env = np.exp(-t * 9) * (1 - np.exp(-t * 900))
    return env * (np.sin(2 * np.pi * f * t) + 0.35 * brilho * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 25))


def sino(m, d=0.9):
    t = tempo(d)
    f = hz(m)
    env = np.exp(-t * 4.5) * (1 - np.exp(-t * 1500))
    return env * (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 9) + 0.15 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 18))


def pad(notas, d):
    t = tempo(d)
    s = np.zeros_like(t)
    for m in notas:
        for det in (-0.12, 0.12):
            f = hz(m + det)
            for h, a in ((1, 1), (2, .35), (3, .18), (4, .08)):
                s += a * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28))
    ataque = np.minimum(1, t / 0.35)
    soltura = np.minimum(1, (d - t) / 0.3)
    return s * ataque * np.clip(soltura, 0, 1) / (len(notas) * 4)


def baixo(m, d):
    t = tempo(d)
    f = hz(m)
    env = (1 - np.exp(-t * 400)) * np.exp(-t * 3.5)
    return env * (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t))


def bumbo():
    t = tempo(0.35)
    f = 48 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def ruido(d):
    x = rng.standard_normal(int(d * SR))
    return np.diff(x, prepend=0)  # agudo (passa-alta simples)


def palma():
    t = tempo(0.25)
    env = sum(np.exp(-np.maximum(t - k * 0.011, 0) * 60) * (t >= k * 0.011) for k in range(3)) + 0.6 * np.exp(-t * 18)
    return ruido(0.25) * env * 0.07


def chimbal(d=0.06):
    t = tempo(d)
    return ruido(d) * np.exp(-t * 70) * 0.05


def prato():
    t = tempo(1.8)
    return ruido(1.8) * np.exp(-t * 2.6) * 0.09


def pop(m=84):
    t = tempo(0.14)
    f = hz(m) * (1 + 0.8 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * (1 - np.exp(-t * 3000))


def clique():
    t = tempo(0.05)
    return (np.sin(2 * np.pi * 2200 * t) * 0.6 + ruido(0.05) * 0.2) * np.exp(-t * 110)


def vento(d=0.45):
    t = tempo(d)
    env = np.sin(np.pi * t / d) ** 2
    x = rng.standard_normal(len(t))
    # passa-baixa móvel: média de janela que encurta (som "abrindo")
    k = 24
    suave = np.convolve(x, np.ones(k) / k, mode='same')
    return (suave * 0.8 + np.diff(x, prepend=0) * 0.05 * t / d) * env * 0.35


# ---------- harmonia ----------
ACORDES = [  # (fundamental do baixo, notas do pad, notas do arpejo)
    (41, (65, 69, 72), (65, 69, 72, 77)),   # Fá
    (36, (64, 67, 72), (60, 64, 67, 72)),   # Dó
    (38, (62, 65, 69), (62, 65, 69, 74)),   # Ré menor
    (34, (62, 65, 70), (58, 62, 65, 70)),   # Si bemol
]
GANCHO = [  # (batida, nota) para cada compasso da progressão
    [(0, 81), (0.5, 84), (1, 81), (1.5, 77), (2, 79), (3, 81)],
    [(0, 79), (0.5, 76), (1, 72), (2, 76), (2.5, 79), (3, 84)],
    [(0, 81), (0.5, 77), (1, 74), (2, 77), (2.5, 81), (3, 86)],
    [(0, 84), (0.5, 82), (1, 81), (1.5, 79), (2, 77), (3, 79)],
]
ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]

# Introdução: acordes de Si bemol e Dó subindo até a entrada do celular
for k, (b, p, a) in enumerate((ACORDES[3], ACORDES[1])):
    t0 = INICIO - (2 - k) * COMP
    if t0 + COMP <= 0:
        continue
    soma('pad', t0, pad(p, COMP + 0.3), 0.9)
    for j in range(8):
        tt = t0 + j * BAT / 2  # colcheias
        soma('arpejo', tt, marimba(a[ARP[j] % 4] + 12, 0.35), 0.10 + 0.12 * (j / 8 + k) / 2)
# subida de ruído até a primeira batida
d = min(INICIO, 2.5)
t = tempo(d)
soma('sfx', INICIO - d, ruido(d) * (t / d) ** 2.2 * 0.05)

# Corpo da música: do início do celular até o fim das telas
n_comp = int(np.ceil((FIM - INICIO) / COMP))
for c in range(n_comp):
    t0 = INICIO + c * COMP
    b, p, a = ACORDES[c % 4]
    soma('pad', t0, pad(p, COMP + 0.3), 0.55)
    # baixo em colcheias com pausa no contratempo do 4º tempo
    for j in range(8):
        if j == 7:
            continue
        soma('baixo', t0 + j * BAT / 2, baixo(b + (12 if j in (3, 6) else 0), BAT / 2 * 0.95), 0.24)
    # arpejo de marimba em semicolcheias
    for j in range(16):
        soma('arpejo', t0 + j * BAT / 4, marimba(a[ARP[j]] + 12, 0.3, 1.0 if j % 4 == 0 else 0.6), 0.19 if j % 4 == 0 else 0.12)
    # bateria
    for j in range(4):
        soma('bateria', t0 + j * BAT, bumbo(), 0.55)
        if j in (1, 3):
            soma('bateria', t0 + j * BAT, palma(), 0.9)
    for j in range(8):
        soma('bateria', t0 + j * BAT / 2 + BAT / 4, chimbal(), 1.0)
        soma('bateria', t0 + j * BAT / 2, chimbal(0.03), 0.5)
    if c % 8 == 7:  # virada no fim de cada frase
        for j in range(4):
            soma('bateria', t0 + 3 * BAT + j * BAT / 4, palma(), 0.35 + 0.15 * j)
    # gancho melódico: compassos 4–11 de cada ciclo de 16
    if 4 <= c % 16 < 12:
        for bt, m in GANCHO[c % 4]:
            soma('melodia', t0 + bt * BAT, sino(m, 0.8), 0.22)
soma('bateria', INICIO, prato(), 1.0)

# Final: acorde de Fá sustentado, sino descendo e fade
soma('bateria', FIM, prato(), 1.2)
soma('pad', FIM, pad((65, 69, 72, 77), DUR - FIM), 0.8)
soma('baixo', FIM, baixo(41, 2.5), 0.4)
for j, m in enumerate((84, 81, 77, 72, 77, 81, 84, 89)):
    soma('melodia', FIM + 0.6 + j * BAT / 2, sino(m, 1.2), 0.16)

# ---------- efeitos sonoros ----------
for tt in ev['telas'][1:]:
    soma('sfx', tt - 0.2, vento(), 0.9)
for k, tt in enumerate(ev['baloes']):
    soma('sfx', tt + 0.08, pop(84 + (k % 3) * 3), 0.18)
for tt in ev['toques']:
    soma('sfx', tt - 0.05, clique(), 0.35)
for k, tt in enumerate(ev.get('pessoas', [])):
    soma('sfx', tt + 0.05, sino(84 + (0, 4, 7, 12)[k % 4], 0.6), 0.14)

# ---------- mixagem ----------
# "sidechain": pad, baixo e arpejo abaixam levemente a cada bumbo
tt = np.arange(N) / SR
fase = np.where(tt >= INICIO, ((tt - INICIO) % BAT) / BAT, 1.0)
fase = np.where(tt < FIM, fase, 1.0)
duck = 1 - 0.35 * np.exp(-fase * 9)
saida = (mix['bateria'] + (mix['baixo'] + mix['pad']) * duck + mix['arpejo'] * (0.6 + 0.4 * duck) + mix['melodia'] + mix['sfx'])
# fade-in curto e fade-out nos 2 s finais
saida *= np.clip(tt / 0.3, 0, 1) * np.clip((DUR - tt) / 2.0, 0, 1)
saida /= np.percentile(np.abs(saida), 99.9)  # nível de referência antes da saturação
saida = np.tanh(saida * 1.1) / np.tanh(1.1)
saida /= np.max(np.abs(saida)) / 0.89
estereo = np.stack([saida, np.roll(saida, 12)], axis=1)  # leve abertura estéreo
pcm = (estereo * 32767).astype('<i2')

import wave  # noqa: E402

with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{sys.argv[2]}: {DUR} s')
