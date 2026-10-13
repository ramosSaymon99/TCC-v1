"""Trilha sonora original do vídeo "modo de uso" (sintetizada, sem direitos de terceiros).

Uso: python3 trilha.py eventos.json saida.wav
eventos.json vem de `VERSAO=... node render.mjs eventos` (DUR, INICIO, FIM, cortes de tela, balões, toques).

Clima lo-fi calmo: 60 bpm com balanço (swing), piano elétrico abafado em acordes com sétima e nona
(Fmaj9 – Em7 – Dm9 – Cmaj9), baixo redondo, batida macia, chiado de vinil e kalimba em frases curtas.
Sem pratos nem subidas de ruído; efeitos de interface bem suaves e afinados no tom da música.
"""
import json
import sys
import wave

import numpy as np

SR = 44100
BAT = 1.0               # 60 bpm
COMP = 4 * BAT          # 4 s por compasso
SWING = 0.58            # posição da colcheia "de trás" dentro da batida
rng = np.random.default_rng(11)

ev = json.load(open(sys.argv[1]))
DUR, INICIO, FIM = ev['DUR'], ev['INICIO'], ev['FIM']
N = int(DUR * SR)
mix = {k: np.zeros(N) for k in ('bateria', 'baixo', 'piano', 'kalimba', 'vinil', 'sfx')}


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def tempo(d):
    return np.arange(int(d * SR)) / SR


def soma(trilha, t0, sinal, ganho=1.0):
    i = int(round(t0 * SR))
    if i >= N or i + len(sinal) <= 0:
        return
    if i < 0:
        sinal, i = sinal[-i:], 0
    f = min(N, i + len(sinal))
    mix[trilha][i:f] += sinal[: f - i] * ganho


def passa_baixa(x, fc, ordem=2):
    """Filtro passa-baixa suave aplicado no domínio da frequência."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** (2 * ordem)), len(x))


# ---------- instrumentos ----------
def rhodes(m, d, vel=1.0):
    """Piano elétrico: fundamental + parcial de sino curto, com tremolo e leve oscilação de afinação (fita)."""
    t = tempo(d)
    f = hz(m) * (1 + 0.0025 * np.sin(2 * np.pi * 0.6 * t))
    fase = 2 * np.pi * np.cumsum(f) / SR
    env = (1 - np.exp(-t * 60)) * np.exp(-t * 0.9) * np.clip((d - t) / 0.4, 0, 1)
    s = np.sin(fase) + 0.25 * np.sin(2 * fase) * np.exp(-t * 3) + 0.12 * np.sin(7 * fase) * np.exp(-t * 14)
    return s * env * (1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)) * vel


def kalimba(m, d=1.4):
    t = tempo(d)
    f = hz(m)
    env = (1 - np.exp(-t * 800)) * np.exp(-t * 3.2)
    return env * (np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 5.9 * f * t) * np.exp(-t * 20))


def baixo(m, d):
    t = tempo(d)
    env = (1 - np.exp(-t * 120)) * np.exp(-t * 1.2) * np.clip((d - t) / 0.15, 0, 1)
    return env * np.sin(2 * np.pi * hz(m) * t)


def bumbo():
    t = tempo(0.4)
    f = 45 + 55 * np.exp(-t * 22)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def caixa():
    """Caixa abafada (som de escovinha): ruído com corpo grave, sem ataque estalado."""
    t = tempo(0.3)
    x = rng.standard_normal(len(t))
    corpo = np.convolve(x, np.ones(18) / 18, mode='same')
    return (corpo * 2.2 + 0.25 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t * 16) * (1 - np.exp(-t * 300))


def chimbal(forte=1.0):
    t = tempo(0.05)
    x = np.diff(rng.standard_normal(len(t)), prepend=0)
    return x * np.exp(-t * 90) * 0.035 * forte


def tic(m):
    """Toque suave de interface (kalimba curtinha), no tom da música."""
    t = tempo(0.5)
    return np.sin(2 * np.pi * hz(m) * t) * (1 - np.exp(-t * 500)) * np.exp(-t * 9)


def sopro(d=0.7):
    t = tempo(d)
    x = rng.standard_normal(len(t))
    return np.convolve(x, np.ones(60) / 60, mode='same') * np.sin(np.pi * t / d) ** 2


# ---------- harmonia (Fá maior, acordes com sétima e nona) ----------
ACORDES = [  # (baixo, voicing do piano)
    (41, (57, 60, 64, 67)),   # Fmaj9: A C E G sobre Fá
    (40, (55, 59, 62, 66)),   # Em7(9): G B D F#
    (38, (57, 60, 64, 65)),   # Dm9: A C E F
    (36, (55, 59, 62, 64)),   # Cmaj9: G B D E
]
FRASES = [  # kalimba (batida, nota) — frases curtas, com respiro
    [(0.5, 72), (1.0, 74), (1.5, 76), (2.5, 79)],
    [(0.5, 76), (1.5, 74), (2.0, 71)],
    [(0.5, 72), (1.0, 69), (2.0, 72), (3.0, 74)],
    [(1.0, 71), (2.0, 67)],
]
VELS = (1.0, 0.75, 0.85, 0.8)

n_ini = int(np.ceil(INICIO / COMP))  # compassos de introdução antes do celular
n_corpo = int(np.ceil((FIM - INICIO) / COMP))
for c in range(-n_ini, n_corpo):
    t0 = INICIO + c * COMP
    b, voz = ACORDES[c % 4]
    # piano: acorde "dedilhado" no 1, retomado no contratempo do 3
    for k, m in enumerate(voz):
        soma('piano', t0 + k * 0.025, rhodes(m, 2.6, VELS[k]), 0.16)
        soma('piano', t0 + 2 * BAT + SWING * BAT + k * 0.02, rhodes(m, 1.6, VELS[k] * 0.7), 0.11)
    if c < 0:
        continue  # introdução: só piano e vinil
    # baixo redondo: fundamental no 1, quinta antes do 3
    soma('baixo', t0, baixo(b, 1.9), 0.32)
    soma('baixo', t0 + 2 * BAT + SWING * BAT, baixo(b + 7, 1.2), 0.22)
    # batida macia: bumbo no 1 e no "e" do 2, caixa abafada no 2 e no 4
    soma('bateria', t0, bumbo(), 0.5)
    soma('bateria', t0 + BAT + SWING * BAT, bumbo(), 0.32)
    soma('bateria', t0 + BAT, caixa(), 0.16)
    soma('bateria', t0 + 3 * BAT, caixa(), 0.16)
    for j in range(4):
        soma('bateria', t0 + j * BAT, chimbal(1.0))
        soma('bateria', t0 + j * BAT + SWING * BAT, chimbal(0.6))
    # kalimba: frases em compassos alternados, a partir do segundo
    if c >= 1 and c % 2 == 1:
        for bt, m in FRASES[(c // 2) % 4]:
            soma('kalimba', t0 + bt * BAT, kalimba(m), 0.18)

# Final: acorde de Fmaj9 aberto e longo, kalimba subindo devagar
for k, m in enumerate((53, 57, 60, 64, 67, 72)):
    soma('piano', FIM + k * 0.05, rhodes(m, DUR - FIM, 0.9), 0.14)
soma('baixo', FIM, baixo(41, 4), 0.35)
for j, m in enumerate((72, 76, 79, 84)):
    soma('kalimba', FIM + 1.0 + j * 0.75, kalimba(m, 2.0), 0.1)

# Vinil: chiado bem baixo e estalinhos esparsos durante todo o vídeo
mix['vinil'] += passa_baixa(rng.standard_normal(N), 3500) * 0.006
for tt in rng.uniform(0, DUR, int(DUR * 2.5)):
    soma('vinil', tt, np.exp(-tempo(0.004) * 1500) * rng.uniform(-1, 1) * 0.05)

# ---------- efeitos de interface (suaves, no tom) ----------
NOTAS_TIC = (72, 76, 79, 81, 84)  # pentatônica de Fá
for tt in ev['telas'][1:]:
    soma('sfx', tt - 0.3, sopro(), 0.035)
for k, tt in enumerate(ev['baloes']):
    soma('sfx', tt + 0.1, tic(NOTAS_TIC[k % len(NOTAS_TIC)]), 0.05)
for tt in ev['toques']:
    soma('sfx', tt, tic(88) * 0.6, 0.05)
for k, tt in enumerate(ev.get('pessoas', [])):
    soma('sfx', tt + 0.05, kalimba((72, 76, 79, 84)[k % 4], 1.0), 0.08)

# ---------- mixagem ----------
tt = np.arange(N) / SR
fase = np.where((tt >= INICIO) & (tt < FIM), ((tt - INICIO) % BAT) / BAT, 1.0)
respira = 1 - 0.18 * np.exp(-fase * 6)  # o piano e o baixo "respiram" com o bumbo
saida = (mix['bateria'] + (mix['piano'] + mix['baixo']) * respira + mix['kalimba'] + mix['vinil'] + mix['sfx'])
saida = passa_baixa(saida, 5200, 1)  # som abafado, típico do lo-fi
saida *= np.clip(tt / 1.2, 0, 1) * np.clip((DUR - tt) / 3.0, 0, 1)
saida /= np.percentile(np.abs(saida), 99.9)
saida = np.tanh(saida * 0.9) / np.tanh(0.9)
saida /= np.max(np.abs(saida)) / 0.89
estereo = np.stack([saida, np.roll(saida, 18)], axis=1)
pcm = (estereo * 32767).astype('<i2')
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{sys.argv[2]}: {DUR} s')
