import os
import json
import re
from .nlp import extract_tasks
from difflib import get_close_matches

def map_name_to_db(name, user_list):
    if not name:
        return name

    name = name.lower()

    # Normalize user list
    user_map = {u.lower(): u for u in user_list}

    # 🔥 1. Direct match
    if name in user_map:
        return user_map[name]

    # 🔥 2. Fuzzy match
    matches = get_close_matches(name, user_map.keys(), n=1, cutoff=0.6)
    if matches:
        return user_map[matches[0]]

    # 🔥 3. Phonetic-like fallback (basic)
    for u in user_map:
        if sorted(u) == sorted(name):  # loose similarity
            return user_map[u]

    return name.title()  # fallback original

def clean_task_text(task):
    if not task:
        return task

    task = task.lower().strip()

    # Remove person names at the beginning (common names)
    task = re.sub(r'^(rishikant|priya|rahul|raj|amit|rishu|techansh|manager|employee|team|we|you|i)\s*[,:]\s*', '', task)

    # Remove common fillers
    fillers = [
        "i need you to", "please", "you should", "kindly", "i want you to",
        "make sure to", "can you", "could you", "would you", "will you",
        "i need the", "we need", "they need", "the team needs",
        "i need", "we need to", "you need to", "they need to"
    ]

    for f in fillers:
        task = task.replace(f, "")

    # Remove time references at the end if they're not part of the core task
    task = re.sub(r'\s+(by|before|after|on|at|in)\s+(tomorrow|today|tonight|yesterday|next week|this week|eod|asap|soon|immediately|now)$', '', task)

    return task.strip().capitalize()


def extract_tasks_with_gemini(text, user_list=[]):
    # Try using Gemini API first if configured
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            #print(api_key)
            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"""
You are an advanced AI meeting assistant fluent in English and Hindi (हिंदी) and act as precise data extraction assistant.

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
   - Remove things like "please", "kindly", "you should", "i need you to", etc. Focus on the core action.

5. DEADLINES:
   - Associate deadlines with correct tasks.
   - Keep time references as-is: "today", "tomorrow", "आज", "कल", "EOD", "शाम 4 बजे", etc.

6. PRIORITY:
   - High → urgent, asap, immediately, critical, जरूरी, तुरंत, आसानी से, or very short deadlines (minutes/hours)
   - Medium → today, tonight, tomorrow, आज, आज रात, कल, EOD
   - Low → everything else

7. CLEAN TASKS:
   - Extract ONLY the core actionable task, not the full sentence
   - Remove person names, filler words, and context
   - Examples:
     - "Rishikant, I need the deployment as soon as possible by tomorrow" → "deployment as soon as possible"
     - "Priya, please prepare the report today" → "prepare the report"
     - "Rahul, you should complete the code review" → "complete the code review"
   - Keep tasks short and action-oriented (3-8 words max)

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
                for task in result.get("tasks", []):
                    task["assignedTo"] = map_name_to_db(task.get("assignedTo"), user_list)
                    task["task"] = clean_task_text(task.get("task"))
                return result
        except Exception as e:
            print(f"Gemini API fallback triggered due to error: {e}")

    # Generic extraction using pure NLP from nlp.py for unlimited number of tasks/people
    tasks = extract_tasks(text)
    
    if tasks:
        for task in tasks:
            task["assignedTo"] = map_name_to_db(task.get("assignedTo"), user_list)
            task["task"] = clean_task_text(task.get("task"))
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