"""Pull the generated music out of the Gemini Studio library into assets/audio/.

Tracks are matched by their exact prompt text, not by job id: job ids restart at
j1 every time the Studio server restarts and library/index.json persists, so an
id matches old runs too. The prompt is unique per preset.

    python tools/collect-music.py [--dry]
"""
import io
import json
import os
import shutil
import sys

STUDIO = r"C:\Users\it\Desktop\Gemini Prompt Sender\dashboard"
LIB = os.path.join(STUDIO, "library")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "audio")

# key -> the prompt that produced it, verbatim from AUDIO_PACKS in the Studio UI
WANT = {
    # --- soundtrack ---
    "theme": "a 30 second cartoon comedy main theme for an office chaos video game: cheeky funk bass, muted electric guitar stabs, brass hits, handclaps, mischievous and confident, loops cleanly, no vocals",
    "menu": "a 30 second relaxed loop for a game menu: soft rhodes piano, brushed drums, elevator jazz played slightly too cheerfully, light and unhurried, loops cleanly, no vocals",
    "calm": "a 30 second low-key corporate muzak loop: soft synth pads, gentle marimba, polite and deliberately boring, quiet, loops cleanly, no vocals",
    "chaos1": "a 30 second sneaky comedy loop: pizzicato strings tiptoeing, bassoon, finger snaps, light tambourine, mischievous and building, loops cleanly, no vocals",
    "chaos2": "a 30 second frantic comedy chase loop: fast walking upright bass, brass stabs, busy ride cymbal, a cartoon orchestra losing control, loops cleanly, no vocals",
    "chaos3": "a 30 second cartoon riot loop: fast big band brass, driving toms, screaming clarinet runs, distant sirens, chaotic and hilarious, loops cleanly, no vocals",
    "bosschase": "a 30 second furious comedy chase theme: heavy low brass, galloping timpani, angry staccato strings, a villain march played far too fast, loops cleanly, no vocals",
    "promote": "a short triumphant comedy fanfare: bright brass fanfare, cymbal roll, a ridiculous corporate ta-da orchestra hit, celebratory, no vocals",
    "fired": "a short deflating comedy game-over cue: descending tuba, sad trombone wah-wah, a music box winding down to nothing, defeated, no vocals",
    "shop": "a 30 second smug shopping loop: slinky wah-wah guitar, finger snaps, vibraphone, cool and conspiratorial, loops cleanly, no vocals",
    # --- room beds ---
    "room_lift": "a 30 second deliberately bland elevator muzak loop: soft vibraphone melody, gentle bossa nova brush drums, lazy flute, pleasant and utterly forgettable, loops cleanly, no vocals",
    "lift_ding": "a short polite two-note lift chime sting: a soft mallet bell ding-dong with a warm tail, calm and corporate, no vocals",
    "room_reception": "a 30 second bright welcoming loop: light acoustic guitar, soft shaker, cheerful marimba, corporate and harmless, loops cleanly, no vocals",
    "room_break": "a 30 second easy break-room loop: warm rhodes piano, brushed drums, lazy upright bass, unhurried and comfortable, loops cleanly, no vocals",
    "room_meeting": "a 30 second tense corporate meeting loop: sparse ticking percussion, low sustained strings, a single repeating piano note, quietly uncomfortable, loops cleanly, no vocals",
    "room_boardroom": "a 30 second self-important executive loop: stately brass, slow marching snare, deep double bass, expensive and smug, loops cleanly, no vocals",
    "room_boss": "a 30 second ominous comedy villain loop: low pipe organ, brooding cellos, slow menacing timpani, theatrical and ridiculous, loops cleanly, no vocals",
    "room_machines": "a 30 second rhythmic office-machine loop built from printer clicks, phone trills, keyboard clatter and a photocopier hum, mechanical and groovy, loops cleanly, no vocals",
    # --- impact cues. Only the five big, infrequent moments: these are ~30s
    # music cues that OPEN on the hit, so js/music.js trims each to its first
    # couple of seconds at load. The per-material smashes are deliberately not
    # here - glass/metal/paper/plastic fire constantly and SFX.smash() already
    # does them for nothing.
    "combo_finish": "a short triumphant cartoon combo finisher sting: four rising percussion hits then a huge cymbal and brass slam, comedy fight cue, no vocals",
    "ground_slam": "a short earth-shaking cartoon sting: a giant timpani and bass drum slam, low piano rumble, rattling cymbals settling, comedy orchestra, no vocals",
    "dinner_bell": "a short comedy sting built on a ringing frying-pan clang: bright metallic bell hit, wobbling overtone, a dizzy little celesta spiral, no vocals",
    "full_throttle": "a 30 second frantic cartoon rocket-ride loop: revving low brass, galloping snare, ascending whistle runs, wild and out of control, loops cleanly, no vocals",
    "total_wipeout": "a short chaotic cartoon demolition sting: a cascade of crashes, tumbling timpani, brass glissando falling, cymbals everywhere, comedy orchestra, no vocals",
}


def main():
    dry = "--dry" in sys.argv
    index = json.load(io.open(os.path.join(LIB, "index.json"), encoding="utf-8"))
    # newest first already; keep the first mp3 match per prompt
    by_prompt = {}
    for e in index:
        if e.get("kind") != "audio" or not e.get("file", "").endswith(".mp3"):
            continue
        by_prompt.setdefault(e["prompt"], e)

    if not dry:
        os.makedirs(OUT, exist_ok=True)
    missing, total = [], 0
    manifest = {}
    for key, prompt in WANT.items():
        e = by_prompt.get(prompt)
        if not e:
            missing.append(key)
            continue
        src = os.path.join(LIB, e["file"].replace("/", os.sep))
        dst = os.path.join(OUT, key + ".mp3")
        size = os.path.getsize(src)
        total += size
        manifest[key] = {"title": e.get("title", ""), "dur": round(e.get("dur") or 0, 1), "kb": size // 1024}
        print("%-16s %-30s %5d KB" % (key, (e.get("title") or "-")[:30], size // 1024))
        if not dry:
            shutil.copyfile(src, dst)

    if not dry:
        io.open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8").write(
            json.dumps(manifest, indent=1, ensure_ascii=False)
        )
    print("\n%d/%d tracks, %.1f MB%s" % (len(WANT) - len(missing), len(WANT), total / 1048576.0, "  (dry run)" if dry else ""))
    if missing:
        print("MISSING:", ", ".join(missing))
        sys.exit(1)


if __name__ == "__main__":
    main()
