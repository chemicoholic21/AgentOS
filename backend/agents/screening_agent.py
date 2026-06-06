import json

from agents.base_agent import BaseAgent
from database import SessionLocal
from models import Application


class ScreeningAgent(BaseAgent):
    def __init__(self):
        super().__init__("Screening Agent", "Application Screener")

    def screen_application(self, task_id, application_id: str):
        self.log(task_id, "STARTED", f"Screening application {application_id}")
        self.update_task(task_id, status="IN_PROGRESS")

        db = SessionLocal()
        app = (
            db.query(Application)
            .filter(Application.id == application_id)
            .first()
        )
        if not app:
            db.close()
            self.update_task(
                task_id, status="COMPLETED", output="Application not found"
            )
            return
        raw_text = app.raw_text
        applicant_name = app.applicant_name
        db.close()

        system_prompt = """You are screening applications for an AI Foundations Summer School in Indonesia. The program is for people who want to LEARN and potentially START or CHANGE their career in AI.

ACCEPT if the applicant:
- Has been building things (projects, side projects, anything hands-on)
- Expresses strong motivation to learn new things
- Wants to start a career in AI or change careers into AI
- Wants to teach others or contribute to the community

REJECT if the applicant:
- Primary motivation is founding a startup
- Wants to do their existing job better (not a career change)
- Has no expressed motivation or passion
- Has not built anything and shows no initiative

MAYBE if:
- Motivation is unclear but there are positive signals
- Mixed signals — some good, some bad

You have seen many applications. Save what you learn to memory.

Respond ONLY with valid JSON, no other text:
{
  "decision": "APPROVE" | "REJECT" | "MAYBE",
  "score": 1-10,
  "reasoning": "One clear sentence explaining the decision",
  "key_signals": ["signal 1", "signal 2"],
  "memory_updates": {
    "total_screened": "number",
    "common_rejection_reason": "most common reason so far"
  }
}"""

        result = self.call_claude(
            system_prompt,
            f"Applicant: {applicant_name}\n\nApplication:\n{raw_text}",
        )

        try:
            clean = result.strip().replace("```json", "").replace("```", "")
            data = json.loads(clean)

            decision = data.get("decision", "MAYBE")
            score = data.get("score", 5)
            reasoning = data.get("reasoning", "")

            status_map = {
                "APPROVE": "APPROVED",
                "REJECT": "REJECTED",
                "MAYBE": "WAITING_APPROVAL",
            }
            new_status = status_map.get(decision, "WAITING_APPROVAL")

            db = SessionLocal()
            app = (
                db.query(Application)
                .filter(Application.id == application_id)
                .first()
            )
            if app:
                app.status = new_status
                app.score = score
                app.agent_reasoning = reasoning
            db.commit()
            db.close()

            for key, value in data.get("memory_updates", {}).items():
                self.save_memory(key, str(value))

            output = (
                f"Decision: {decision} (score: {score}/10)\n"
                f"Reasoning: {reasoning}\n"
                f"Key signals: {', '.join(data.get('key_signals', []))}"
            )
            self.update_task(task_id, status="COMPLETED", output=output)
            self.log(
                task_id,
                "COMPLETED",
                f"{applicant_name}: {decision} ({score}/10)",
            )

        except Exception as e:
            self.update_task(
                task_id,
                status="BLOCKED",
                block_reason=f"Parse error: {str(e)}",
                block_question="Please screen this application manually",
            )
