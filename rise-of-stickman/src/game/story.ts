// What the Forsaken Stable's people say. Each NPC tells one more piece of the betrayal after every
// run (the three brother Horsemen who cast the hero down), reacts to how the last run ended, and
// says something short when there is nothing new.
import type { LastRun } from "./save";

export type NpcId = "krag" | "seer" | "steed";

export const NPC: Record<NpcId, { name: string; title: string }> = {
  krag: { name: "Old Krag", title: "the Chained Smith" },
  seer: { name: "The Hollow Seer", title: "who knows how it ends" },
  steed: { name: "Ashmane", title: "the Spectral Steed" },
};

export const STORY: Record<NpcId, string[]> = {
  krag: [
    "You. Horseman. They said the abyss would keep you. ...The racks are yours. Take what you need.",
    "Those chains you woke in. I forged them. Three riders brought the order. I did not ask why.",
    "Your brothers paid in gold that screamed when I melted it. I kept none of it. Doesn't help.",
    "The eldest wanted the links thick enough to hold a god. The second wanted them to burn. The third only watched.",
    "Cerberus wears a collar of mine too. Same steel, same order. Break it and you break their leash.",
    "I am chained here for my work. Fitting. Every weapon I hand you is a link I take back.",
    "They told me you turned on them first. Liars sound like brothers. Brothers sound like liars.",
    "Keep climbing. When you reach them, show them my steel. Tell them Krag says nothing. Nothing at all.",
  ],
  seer: [
    "Ahh... the fourth rider. I saw you wake before you did. Come. Ask me what fate wants of you.",
    "Three crowns. Three shadows on one throne. They wear your name like a stolen cloak.",
    "You think they cast you down. No. They drew a line, and you fell along it.",
    "Every death here is already written. I only read it aloud. ...You took the third door. You always take the third door.",
    "Your brothers do not sleep. They dream of you climbing, and wake up counting the stairs.",
    "There is a hand behind the hand that pushed you. I cannot see its face. Only ink.",
    "Ashmane remembers that night better than you. Horses always remember who held the knife.",
    "When you reach the top, Horseman, look at your own shadow. Ask who drew it.",
  ],
  steed: [
    "Ashmane lowers her burning head and presses it against your chest. She remembers you.",
    "Blue fire flares along her mane, and in it you see the night of the betrayal: three riders, one blade, her scream.",
    "She stamps once toward the pit, then looks back at you. Waiting.",
    "Ashmane noses the old scar across her neck, then the one across your chest. The same blade made both.",
    "She nickers softly. For a moment the stable is quiet, and the chains stop swinging.",
    "When you speak your brothers' names she rears, and her flame burns cold and white.",
  ],
};

const IDLE: Record<NpcId, string[]> = {
  krag: ["Hm.", "Steel's ready.", "Go. Come back worse.", "The forge doesn't sleep. Neither do I."],
  seer: ["Shh. Fate is listening.", "I saw you return. I saw you leave. Both are true.", "Your thread is long tonight.", "Ask, Horseman. Or don't. I already know which."],
  steed: ["Ashmane snorts blue sparks.", "She paws the floor, eager to ride.", "Ashmane watches the pit.", "She flicks an ear toward you and goes back to her burning hay."],
};

/** A line about how the last run ended (or null). */
export function reaction(npc: NpcId, last: LastRun | null): string | null {
  if (!last) return null;
  if (last.result === "won")
    return { krag: "You broke the hound. Good. I'll forge harder steel.", seer: "Cerberus fell. I knew. I let you be surprised.", steed: "Ashmane tosses her mane high, blazing bright with pride." }[npc];
  const by = last.by;
  if (npc === "krag") {
    if (by === "The Chained Cerberus") return "The dog again. Hit the chains, not the teeth.";
    if (by === "The Pit Butcher") return "The Butcher was my apprentice once. I taught him badly. Or too well.";
    if (by === "the abyss") return "The pit took you. The pit takes everything. Watch your feet.";
    if (by === "the pit itself") return "Spikes. Fire. Spit from the dark. ...Look down sometimes.";
    return `Killed by ${by}. Hm. Hold the blade tighter.`;
  }
  if (npc === "seer") {
    if (by === "the abyss") return "You fell into the dark, and the dark fell into you. Both are healing.";
    return `${by[0].toUpperCase()}${by.slice(1)}, in chamber ${last.room}. I wept for you yesterday.`;
  }
  return "Ashmane circles you, sniffing for wounds that are already gone.";
}

export function idleLine(npc: NpcId) {
  const a = IDLE[npc];
  return a[(Math.random() * a.length) | 0];
}

export const GIFT_LINES: Record<string, string> = {
  krag: "...Grave Wine. Haven't tasted this since before the chains. Take this. A shard of the anvil that made them.",
  seer: "Grave Wine... I saw you bring it. Take my eye. The one I no longer need.",
  steed: "Ashmane drinks the wine from your cupped hands. A horseshoe drops from her hoof, still glowing with ash.",
  merchant: "Grave Wine? For me? Heh heh... I'm touched. Truly. Here, have a tooth. Gold. Mostly.",
};

/** First words when the hero wakes in the stable for the very first time. */
export const FIRST_WAKE = "Wake, Horseman. This is the Forsaken Stable. It is the closest thing to home the dead are given.";
