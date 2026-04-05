import os
import json
from .nlp import extract_tasks


def extract_tasks_with_gemini(text):
    # Try using Gemini API first if configured
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            #print(api_key)
            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"""
You are an advanced AI meeting assistant fluent in English and Hindi (हिंदी).

Your task is to extract ALL actionable tasks with HIGH accuracy from meeting transcripts in ANY language.

CRITICAL RULES:

1. LANGUAGE SUPPORT:
   - Automatically detect if the transcript is in English, Hindi, or mixed (Hinglish).
   - Process both languages seamlessly.
   - Return results in the same language(s) as the input.

2. PERSON IDENTIFICATION:
   - A person is ALWAYS a proper human name (e.g., Rahul, Priya, राज, प्रिया) not like eg : (the manager , the employee).
   - DO NOT treat verbs or actions as names (e.g., "Get", "Complete", "करना", "पूरा करना").
   - Common Hindi/Hinglish exclusions: "हाँ", "ठीक है", "ओके", "धन्यवाद", "नमस्ते", "अलविदा", "मैं", "आप", "वह", "वे", आदि are NOT names.
   - If a sentence starts with "Rahul," "Priya," "राज," or "प्रिया," → that person owns ALL following instructions until another name appears.

3. CONTEXT TRACKING:
   - Maintain context across sentences.
   - Example (English): "Priya, you are on vendor follow-ups. Get signed quotes. Deadline tomorrow."
   - Example (Hindi): "प्रिया, तुम विक्रेता फॉलो-अप पर हो। हस्ताक्षरित उद्धरण प्राप्त करें। कल तक।"
   - → ALL tasks belong to Priya/प्रिया.

4. TASK EXTRACTION:
   - Extract ONLY actionable tasks.
   - Break multiple instructions into separate tasks.
   - Support Hindi task descriptions: e.g., "रिपोर्ट तैयार करें", "मीटिंग शेड्यूल करें"

5. DEADLINES:
   - Associate deadlines with correct tasks.
   - Keep time references as-is: "today", "tomorrow", "आज", "कल", "EOD", "शाम 4 बजे", etc.

6. PRIORITY:
   - High → urgent, asap, immediately, critical, जरूरी, तुरंत, आसानी से, or very short deadlines (minutes/hours)
   - Medium → today, tonight, tomorrow, आज, आज रात, कल, EOD
   - Low → everything else

7. CLEAN TASKS:
   - Remove filler words ("I need", "you are on", "मुझे चाहिए", "आप हो")
   - Keep tasks short and action-oriented

OUTPUT FORMAT:
Return ONLY valid JSON (even if input is Hindi or mixed):

{
  "summary": "short meeting summary (in the same language as input)",
  "tasks": [
    {
      "task": "task description (in the same language as input)",
      "assignedTo": "person name",
      "deadline": "deadline text",
      "priority": "High/Medium/Low"
    }
  ]
}

STRICT:
- NO markdown
- NO explanations
- NO invalid JSON
- Process all languages equally

Transcript:
{text}
            """
            response = model.generate_content(prompt)
            output = response.text.replace("```json", "").replace("```", "").strip()
            result = json.loads(output)
            if "tasks" in result and "summary" in result:
                return result
        except Exception as e:
            print(f"Gemini API fallback triggered due to error: {e}")

    # Generic extraction using pure NLP from nlp.py for unlimited number of tasks/people
    tasks = extract_tasks(text)
    
    if tasks:
        people = list(set([t["assignedTo"] for t in tasks if t.get("assignedTo")]))
        if people:
            summary = f"Meeting focused on delegating tasks to: {', '.join(people)}."
        else:
            summary = f"Meeting focused on {len(tasks)} discussed tasks."
    else:
        summary = "No actionable tasks were identified during the meeting."
        
    return {
        "summary": summary,
        "tasks": tasks,
        
    }