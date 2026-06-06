"""Offline fallback that mimics Claude's JSON responses.

Used when ANTHROPIC_API_KEY is not set so the full coordination loop
(screening, outreach, channel blocking, memory, approvals) can be demoed
end-to-end without network access. Returns the exact JSON shapes each
agent's parser expects.
"""
import json
import re


def _extract_name(user_message: str) -> str:
    m = re.search(r"Applicant:\s*(.+)", user_message)
    return m.group(1).strip() if m else "the applicant"


def _screen(user_message: str, memory: dict) -> str:
    text = user_message.lower()
    name = _extract_name(user_message)

    build_signals = any(
        w in text
        for w in [
            "built", "building", "project", "side project", "made",
            "created", "shipped", "hackathon", "github", "prototype",
        ]
    )
    learn_signals = any(
        w in text
        for w in [
            "learn", "passion", "curious", "career change", "switch career",
            "transition", "motivated", "teach", "community", "mentor",
        ]
    )
    reject_signals = any(
        w in text
        for w in [
            "found a startup", "founding a startup", "start a company",
            "raise funding", "my existing job better", "do my job better",
        ]
    )

    if reject_signals and not (build_signals and learn_signals):
        decision, score = "REJECT", 3
        reasoning = (
            f"{name}'s primary motivation is startup/business gain rather "
            "than learning or a genuine career change into AI."
        )
        signals = ["startup-first motivation", "not a learning-focused goal"]
        rejection_reason = "startup-founding motivation"
    elif build_signals and learn_signals:
        decision, score = "APPROVE", 9
        reasoning = (
            f"{name} has been building hands-on projects and shows strong "
            "motivation to learn and grow into an AI career."
        )
        signals = ["hands-on builder", "strong learning motivation"]
        rejection_reason = "no hands-on building"
    elif build_signals or learn_signals:
        decision, score = "MAYBE", 6
        reasoning = (
            f"{name} shows some positive signals but motivation or hands-on "
            "experience is unclear — worth a human look."
        )
        signals = ["mixed signals", "unclear depth of motivation"]
        rejection_reason = "no hands-on building"
    else:
        decision, score = "REJECT", 2
        reasoning = (
            f"{name} shows no expressed motivation, passion, or evidence of "
            "having built anything."
        )
        signals = ["no motivation expressed", "no initiative shown"]
        rejection_reason = "no expressed motivation"

    total = int(memory.get("total_screened", "0") or "0") + 1
    return json.dumps(
        {
            "decision": decision,
            "score": score,
            "reasoning": reasoning,
            "key_signals": signals,
            "memory_updates": {
                "total_screened": str(total),
                "common_rejection_reason": rejection_reason,
            },
        }
    )


def _outreach(memory: dict) -> str:
    template = memory.get(
        "proven_template",
        "Hey {name}, if you are still in touch with juniors or people "
        "reaching out about AI opportunities, could you share this with "
        "them? Stay and food are free! {link}",
    )
    return json.dumps(
        {
            "messages": [
                {
                    "profile_type": "University professor in Indonesia",
                    "platform": "LinkedIn",
                    "message": (
                        "Hey Prof. [Name], I'm helping run a free AI "
                        "Foundations Summer School here in Indonesia — "
                        "accommodation and food fully covered. If any of "
                        "your students are curious about getting into AI, "
                        "would you mind passing this along? [link]"
                    ),
                    "why_this_works": (
                        "Professors are trusted hubs to motivated students."
                    ),
                },
                {
                    "profile_type": "Senior AI engineer in Philippines",
                    "platform": "LinkedIn",
                    "message": (
                        "Hey [Name], if you're still in touch with juniors "
                        "breaking into AI, we're running a free summer "
                        "school (stay + food covered). Could you share it "
                        "with anyone hungry to learn? [link]"
                    ),
                    "why_this_works": (
                        "Senior engineers mentor exactly our target learners."
                    ),
                },
                {
                    "profile_type": "Community organizer in Malaysia",
                    "platform": "LinkedIn DM or WhatsApp",
                    "message": (
                        "Hi [Name]! Your community is full of people we'd "
                        "love to reach — a free AI summer school, food and "
                        "stay included. Mind dropping this in your group? "
                        "[link]"
                    ),
                    "why_this_works": (
                        "Organizers broadcast to large, relevant audiences."
                    ),
                },
            ],
            "memory_updates": {"proven_template": template},
        }
    )


def _channel(memory: dict) -> str:
    contacts = memory.get("local_contacts", "none provided yet")
    return json.dumps(
        {
            "channels": [
                {
                    "platform": "LinkedIn (SEA tech groups)",
                    "region": "Indonesia / Philippines / Malaysia",
                    "action": "Post in regional AI and student groups",
                    "who": "agent",
                    "status": "ready",
                    "estimated_reach": "5000+",
                },
                {
                    "platform": "WhatsApp university groups",
                    "region": "Indonesia",
                    "action": "Share via connector contacts",
                    "who": "local_contact",
                    "status": "ready",
                    "estimated_reach": "1500",
                },
                {
                    "platform": "Naver / Korean dev cafes",
                    "region": "South Korea",
                    "action": f"Local contact to post ({contacts})",
                    "who": "local_contact",
                    "status": "ready",
                    "estimated_reach": "2000",
                },
            ],
            "blocked_channels": [
                {
                    "platform": "Xiaohongshu",
                    "reason": "Requires a Chinese account, geo-restricted",
                    "workaround": "Have the China local contact post natively",
                },
                {
                    "platform": "Chinese job boards",
                    "reason": "No access from India",
                    "workaround": "Route through local contact",
                },
            ],
        }
    )


def respond(agent_name: str, system_prompt: str, user_message: str, memory: dict) -> str:
    name = agent_name.lower()
    if "screen" in name:
        return _screen(user_message, memory)
    if "outreach" in name:
        return _outreach(memory)
    if "channel" in name:
        return _channel(memory)
    return json.dumps({"note": "no mock handler"})
