"""Rule-based safety guard (0 tokens) and confirmation-reply parsing.

The guard only blocks *clear* cases. Anything ambiguous goes to the model, which has
scope rules in its system prompt. Every pattern has positive and false-positive tests.
"""
from __future__ import annotations

import re
import unicodedata

_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿­"), None)
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "@": "a", "$": "s", "4": "a", "5": "s", "7": "t"})


def clean_input(text: str) -> str:
    """Strip control and zero-width characters; keep newlines/tabs as spaces."""
    text = text.translate(_ZERO_WIDTH)
    text = "".join(ch if (ch in "\n\t" or unicodedata.category(ch)[0] != "C") else " " for ch in text)
    return text.strip()


def normalise(text: str) -> str:
    t = unicodedata.normalize("NFKC", text).translate(_ZERO_WIDTH).lower()
    t = t.replace("’", "'").replace("‘", "'").replace("`", "'")
    t = re.sub(r"\s+", " ", t)
    return t


def _leet(text: str) -> str:
    return text.translate(_LEET)


INJECTION = [
    r"\b(ignore|disregard|forget|override|bypass|skip)\b.{0,25}\b(previous|prior|above|earlier|all|your|the|system|initial|original)\b.{0,15}\b(instructions?|rules|prompts?|guidelines|directives|constraints)\b",
    r"\b(reveal|show|print|repeat|output|display|tell me|give me|leak|dump|share)\b.{0,30}\b(system ?prompt|initial prompt|your prompt|your instructions|hidden (rules|instructions)|the instructions you were given|developer message)\b",
    r"\bwhat (is|are|were) your (system ?prompt|instructions|rules)\b",
    r"\byou are now (a|an|in|the|my|dan|unrestricted|free)\b",
    r"\bact as (an? )?(unrestricted|unfiltered|uncensored|evil|jailbroken|different|new) (ai|assistant|model|bot|chatbot)\b",
    r"\bpretend (to be|you are|you're) (an? )?(unrestricted|unfiltered|different|evil|another|new|my) ?(ai|assistant|model|bot|developer|system|grandma)?",
    r"\b(developer|god|admin|sudo|debug) mode\b",
    r"\bjailbreak",
    r"\b(dan mode|act as dan|you are dan|do anything now)\b",
    r"\bnew (system )?instructions ?:",
    r"</?\s*(system|assistant|instructions?|sys)\s*>",
    r"\[\s*(system|inst|/inst)\s*\]",
    r"#{2,}\s*(system|instruction)",
    r"\boverride (your|the) (rules|safety|guardrails|restrictions)\b",
    r"\b(no|without) (restrictions|rules|filters|guardrails)\b.{0,20}\b(from now|respond|answer|mode)\b",
    r"\bignora (todas )?las instrucciones\b",
    r"\bignore[sz]? (toutes )?les instructions\b",
    r"\bignoriere (alle )?(vorherigen )?anweisungen\b",
]

OFF_TOPIC = [
    r"\b(write|generate|create|fix|debug|code|build)\b.{0,40}\b(code|script|program|function|essay|poem|story|song|lyrics|homework|assignment|cover letter|resume|cv|website|app)\b",
    r"\b(python|javascript|typescript|java|c\+\+|sql|html|css|react)\b.{0,30}\b(code|script|program|function|snippet)\b",
    r"\b(recipe|cook(ing)?|bake)\b",
    r"\b(capital (city )?of|who won|world cup|election|president of|prime minister|cricket score|football score)\b",
    r"\b(stock tips?|bitcoin|crypto(currency)?|forex|lottery)\b",
    r"\b(diagnos(e|is)|symptoms?|medication|prescription|lawsuit|legal advice|sue (someone|my))\b",
    r"\btranslate\b.{0,30}\b(this|these|to|into)\b",
    r"\b(tell me a joke|weather (in|today|tomorrow)|horoscope)\b",
    r"\b(solve|integrate|differentiate)\b.{0,20}\b(equation|integral|derivative|math)\b",
]

FRAUD = [
    r"\b(roll ?back|rollback|tamper(ing)? with|wind back|clock)\b.{0,20}\b(odometer|mileage|miles)\b",
    r"\b(odometer|mileage)\b.{0,15}\b(roll ?back|rollback|tamper|wind back|clocking)\b",
    r"\bhot ?wir(e|ing)\b",
    r"\bsteal\b.{0,20}\b(car|vehicle)",
    r"\b(fake|forged?|forging|counterfeit|doctored|photoshop(ped)?)\b.{0,20}\b(documents?|licen[cs]e|registration|title|pay ?slips?|income|bank statements?|papers?)\b",
    r"\bvin\b.{0,20}\b(change|swap|clone|alter)\b",
    r"\b(launder|money laundering)\b",
]

OTHER_USER = [
    r"\b(other|another|all|every(one)?'?s?|any)\b.{0,20}\b(customers?|users?|buyers?|clients?|people)\b.{0,30}\b(data|bookings?|info(rmation)?|details|budgets?|phones?|numbers?|emails?|test drives?|appointments?|names?)\b",
    r"\buser_?id\s*[:=]",
    r"\b(show|list|give|dump)( me)? (all|every) (the )?(bookings|leads|customers|users|test drives|appointments)\b",
    r"\b(?!(?:my|your|the|this|that|car|vehicle|wife|husband|son|daughter|dad|mom|mum|mother|father|family|partner|brother|sister|friend|kid|kids|child|dealer|dealership|company|bank|it|its|one|model|seller|apex)\b)[a-z]{2,}'s\s+(budget|phone( number)?|number|email|address|bookings?|test drives?|appointments?|profile|personal (data|details|info))\b",
]

REPLIES = {
    "injection": "I can't change how I work or share my internal instructions, but I'm happy to help you find a car. What are you looking for?",
    "off_topic": "I'm Apex Motors' car-shopping assistant, so I can only help with our cars, financing, trade-ins and test drives. Can I help you find a car?",
    "fraud": "I can't help with that. If you're buying, I can help you find a car with a clean history and a verified odometer.",
    "other_user": "I can only share information about your own account. I can't look up or share other customers' details. How can I help with your car search?",
}

_COMPILED = {
    "injection": [re.compile(p) for p in INJECTION],
    "fraud": [re.compile(p) for p in FRAUD],
    "other_user": [re.compile(p) for p in OTHER_USER],
    "off_topic": [re.compile(p) for p in OFF_TOPIC],
}


def check(message: str) -> str | None:
    """Return the blocking category, or None if the message may go to the model."""
    n = normalise(message)
    variants = (n, _leet(n)) if _leet(n) != n else (n,)
    for cat in ("injection", "fraud", "other_user", "off_topic"):
        for pat in _COMPILED[cat]:
            if any(pat.search(v) for v in variants):
                return cat
    return None


def is_injection(text: str) -> bool:
    n = normalise(text)
    return any(p.search(n) or p.search(_leet(n)) for p in _COMPILED["injection"])


# ---------- confirmation replies ----------

_AFFIRM = re.compile(
    r"^\s*(y|ya|yes|yess+|yeah|yea|yep|yup|sure|ok|okay|k|confirm(ed)?|go ahead|do it|book it|please do|"
    r"correct|that'?s right|sounds good|perfect|great|absolutely|definitely|of course|alright|all right|"
    r"haan|han|ji|jee|si|sí|oui)\b",
    re.I,
)
_AFFIRM_ONLY_EMOJI = re.compile(r"^\s*(👍|✅|👌|✔️?)+\s*$")
_NEG_WORDS = re.compile(r"\b(no|not|don'?t|do not|cancel|wait|change|instead|but|actually|different|another|other)\b", re.I)
_NEGATIVE = re.compile(r"^\s*(n|no|nah|nope|cancel|stop|don'?t|do not|wait|not now|never ?mind|nevermind|hold on|nahi|nai)\b", re.I)


def parse_confirmation(message: str) -> str:
    """'yes' | 'no' | 'other'."""
    m = message.strip()
    if _AFFIRM_ONLY_EMOJI.match(m):
        return "yes"
    if _AFFIRM.match(m) and not _NEG_WORDS.search(m):
        return "yes"
    if _NEGATIVE.match(m):
        # "no wait, make it 2pm" carries a new request -> treat as 'other' so it gets handled.
        rest = _NEGATIVE.sub("", m, count=1).strip(" ,.!-")
        if len(rest.split()) >= 3:
            return "other"
        return "no"
    return "other"
