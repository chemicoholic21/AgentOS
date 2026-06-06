// Offline fallback that mimics an LLM's JSON responses. Used when no provider
// API key is set so the full coordination loop (screening, outreach, channel
// blocking, memory, approvals) can be demoed end-to-end without network access.

type Memory = Record<string, string>;

function extractName(userMessage: string): string {
  const m = userMessage.match(/Applicant:\s*(.+)/);
  return m ? m[1].trim() : "the applicant";
}

function screen(userMessage: string, memory: Memory): string {
  const text = userMessage.toLowerCase();
  const name = extractName(userMessage);

  const has = (words: string[]) => words.some((w) => text.includes(w));

  const buildSignals = has([
    "built", "building", "project", "side project", "made", "created",
    "shipped", "hackathon", "github", "prototype", "portfolio", "dashboard",
  ]);
  const learnSignals = has([
    "learn", "passion", "curious", "career change", "switch career",
    "transition", "motivated", "teach", "community", "mentor", "eager",
  ]);
  const rejectSignals = has([
    "found a startup", "founding a startup", "start a company",
    "raise funding", "my existing job better", "do my job better",
  ]);

  let decision: string, score: number, reasoning: string;
  let signals: string[], rejectionReason: string;

  if (rejectSignals && !(buildSignals && learnSignals)) {
    decision = "REJECT";
    score = 3;
    reasoning = `${name}'s primary motivation is founding a startup rather than seeking a role or making a genuine career switch.`;
    signals = ["startup-first motivation", "not actively job-seeking"];
    rejectionReason = "startup-founding motivation";
  } else if (buildSignals && learnSignals) {
    decision = "APPROVE";
    score = 9;
    reasoning = `${name} has been building hands-on projects and shows strong motivation to learn and grow into a new career.`;
    signals = ["hands-on builder", "strong learning motivation"];
    rejectionReason = "no hands-on building";
  } else if (buildSignals || learnSignals) {
    decision = "MAYBE";
    score = 6;
    reasoning = `${name} shows some positive signals but motivation or hands-on experience is unclear — worth a human look.`;
    signals = ["mixed signals", "unclear depth of motivation"];
    rejectionReason = "no hands-on building";
  } else {
    decision = "REJECT";
    score = 2;
    reasoning = `${name} shows no expressed motivation, passion, or evidence of having built anything.`;
    signals = ["no motivation expressed", "no initiative shown"];
    rejectionReason = "no expressed motivation";
  }

  const total = (parseInt(memory.total_screened || "0", 10) || 0) + 1;
  return JSON.stringify({
    decision,
    score,
    reasoning,
    key_signals: signals,
    memory_updates: {
      total_screened: String(total),
      common_rejection_reason: rejectionReason,
    },
  });
}

function outreach(memory: Memory): string {
  const template =
    memory.proven_template ||
    "Hey {name}, if you are still in touch with early-career folks or people looking to switch careers, could you share this opportunity with them? {link}";
  return JSON.stringify({
    messages: [
      {
        profile_type: "University career-services coordinator",
        platform: "LinkedIn",
        message:
          "Hey [Name], I work with early-career job seekers and career switchers looking for their next role. If any of your students or recent grads are on the hunt, would you mind passing this along? [link]",
        why_this_works:
          "Career-services staff are trusted hubs to job seekers.",
      },
      {
        profile_type: "Senior engineer / hiring manager",
        platform: "LinkedIn",
        message:
          "Hey [Name], if you're still in touch with juniors trying to break in or switch fields, we're helping connect motivated candidates to opportunities. Could you share it with anyone who'd be a fit? [link]",
        why_this_works: "Hiring managers know exactly who's a strong fit.",
      },
      {
        profile_type: "Community organizer / meetup host",
        platform: "LinkedIn DM or WhatsApp",
        message:
          "Hi [Name]! Your community is full of people we'd love to reach — early-career folks and career switchers looking for their next role. Mind dropping this in your group? [link]",
        why_this_works: "Organizers broadcast to large, relevant audiences.",
      },
    ],
    memory_updates: { proven_template: template },
  });
}

function channel(memory: Memory): string {
  const contacts = memory.local_contacts || "none provided yet";
  return JSON.stringify({
    channels: [
      {
        platform: "LinkedIn (job-seeker & early-career groups)",
        region: "Global",
        action: "Post in early-career and career-switch groups",
        who: "agent",
        status: "ready",
        estimated_reach: "5000+",
      },
      {
        platform: "University career portals & alumni groups",
        region: "Global",
        action: "Share via career-services connector contacts",
        who: "local_contact",
        status: "ready",
        estimated_reach: "1500",
      },
      {
        platform: "Regional job boards & dev communities",
        region: "Localized",
        action: `Local contact to post (${contacts})`,
        who: "local_contact",
        status: "ready",
        estimated_reach: "2000",
      },
    ],
    blocked_channels: [
      {
        platform: "Xiaohongshu",
        reason: "Requires a Chinese account, geo-restricted",
        workaround: "Have the China local contact post natively",
      },
      {
        platform: "Chinese job boards",
        reason: "No access from this region",
        workaround: "Route through local contact",
      },
    ],
  });
}

export function mockRespond(
  agentName: string,
  userMessage: string,
  memory: Memory,
): string {
  const name = agentName.toLowerCase();
  if (name.includes("screen")) return screen(userMessage, memory);
  if (name.includes("outreach")) return outreach(memory);
  if (name.includes("channel")) return channel(memory);
  return JSON.stringify({ note: "no mock handler" });
}
