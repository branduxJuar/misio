"""Generate small, original PCM cues for the live draw room."""

from math import exp, pi, sin
from pathlib import Path
from struct import pack
import wave


RATE = 22_050
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "sounds"


def bell(t, start, frequency, volume, decay=2.8):
    age = t - start
    if age < 0 or age > 1.6:
        return 0.0
    envelope = (1 - exp(-75 * age)) * exp(-decay * age)
    return volume * envelope * (
        sin(2 * pi * frequency * age)
        + 0.24 * sin(2 * pi * frequency * 2 * age)
        + 0.07 * sin(2 * pi * frequency * 3 * age)
    )


def spin(t):
    # Every component repeats at the 1.6-second boundary for a clean loop.
    pulse_age = (t - 0.055) % 0.2
    tick = 0.12 * exp(-55 * pulse_age) * (
        sin(2 * pi * 820 * pulse_age) + 0.4 * sin(2 * pi * 440 * pulse_age)
    )
    sway = 0.75 + 0.25 * sin(2 * pi * t / 1.6)
    hum = sway * (0.033 * sin(2 * pi * 100 * t) + 0.014 * sin(2 * pi * 180 * t))
    return 1.4 * (tick + hum)


WINNER_NOTES = [
    (0.00, 523.25, 0.18),
    (0.24, 659.25, 0.18),
    (0.48, 783.99, 0.18),
    (0.74, 1046.50, 0.21),
    (1.10, 783.99, 0.10),
    (1.10, 1046.50, 0.15),
    (1.10, 1318.51, 0.13),
]


WATER_NOTES = [
    (0.00, 659.25, 0.14),
    (0.25, 523.25, 0.13),
    (0.50, 392.00, 0.12),
]


def render(path, duration, sound, fade_out=0.0):
    samples = bytearray()
    for index in range(round(RATE * duration)):
        t = index / RATE
        tail = min(1.0, (duration - t) / fade_out) if fade_out else 1.0
        value = max(-1.0, min(1.0, sound(t) * tail))
        samples.extend(pack("<h", round(value * 32_767)))
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(samples)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    render(OUTPUT / "spin.wav", 1.6, spin)
    render(OUTPUT / "ganador.wav", 2.7, lambda t: sum(bell(t, *note) for note in WINNER_NOTES), 0.45)
    render(OUTPUT / "al_agua.wav", 1.7, lambda t: sum(bell(t, *note, decay=3.8) for note in WATER_NOTES), 0.35)


if __name__ == "__main__":
    main()
