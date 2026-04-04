import spacy
import re

nlp = spacy.load("en_core_web_sm")

def extract_tasks(text):
    doc = nlp(text)
    tasks = []
    
    current_person = "Unassigned"
    speaker = "Unassigned"
    
    # Simple speaker detection (who is speaking)
    speaker_match = re.search(r'(?:i am|this is) (?:manager )?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)', text, re.IGNORECASE)
    if speaker_match:
        speaker = speaker_match.group(1)
        current_person = speaker

    for sent in doc.sents:
        # Check if sentence starts with a name (e.g. "Priya, your task is...")
        match = re.match(r'^([A-Z][a-z]+)\s*[,:]', sent.text)
        persons = [ent.text for ent in sent.ents if ent.label_ == "PERSON"]
        
        if match:
            current_person = match.group(1)
        elif persons:
            # pick the last person mentioned usually
            current_person = persons[-1]
            if current_person.lower() in ("i", "me", "my"):
                current_person = speaker

        # Split on coordinating conjunctions for multiple tasks in one sentence
        clauses = re.split(r'\b(?:and|but)\b|[;]', sent.text)
        
        for clause in clauses:
            clause = clause.strip()
            if not clause or clause.lower() in ("and", "but", "so"):
                continue
            
            assigned_person = current_person
            
            # Check for name at the start of the clause
            name_match = re.match(r'^([A-Z][A-Za-z]+|[A-Z]+)\b\s*[,:]?', clause)
            if name_match:
                potential_name = name_match.group(1).capitalize()
                non_names = {"i", "we", "he", "she", "they", "it", "this", "that", "the", "a", "an", "and", "but", "so", "please", "let", "my", "your", "here", "there"}
                if potential_name.lower() not in non_names:
                    assigned_person = potential_name
                    current_person = assigned_person

            if re.match(r'^[Ii]\s', clause) or re.match(r'^I\'m\s', clause):
                assigned_person = speaker
                
            task = {
                "task": None,
                "person": assigned_person,
                "deadline": None,
                "priority": None
            }
            
            sub_doc = nlp(clause)
            
            # Deadline
            for ent in sub_doc.ents:
                if ent.label_ in ("DATE", "TIME"):
                    task["deadline"] = ent.text
                    
            # Priority
            lower_text = clause.lower()
            if any(w in lower_text for w in ["urgent", "asap", "immediately", "critical"]):
                task["priority"] = "High"
            elif any(w in lower_text for w in ["today", "tomorrow", "soon"]):
                task["priority"] = "Medium"
            else:
                task["priority"] = "Low"
                
            # Filter meta chatter
            if "am manager" in lower_text or "hi i am" in lower_text or "hello" in lower_text:
                continue
                
            # Task extraction
            has_verb = any(token.pos_ == "VERB" for token in sub_doc)
            
            if has_verb:
                cleaned = clause
                if name_match and potential_name.lower() not in non_names:
                    cleaned = re.sub(r'^([A-Z][A-Za-z]+|[A-Z]+)\b\s*[,:]?\s*', '', cleaned)

                cleaned = re.sub(r'^[Pp]lease\s+', '', cleaned)
                cleaned = re.sub(r'^[Yy]our task is to\s+', '', cleaned)
                cleaned = re.sub(r'^[Ii] need you to\s+', '', cleaned)
                cleaned = re.sub(r'^[Ii] would like to\s+', '', cleaned)
                
                # Check if it's just a deadline statement
                is_just_deadline = re.match(r'^(the\s+)?(track\s+)?deadline\s+(is|on)', cleaned, re.IGNORECASE)

                if is_just_deadline:
                    if tasks and task["deadline"]:
                        tasks[-1]["deadline"] = task["deadline"]
                elif len(cleaned.split()) > 2:
                    task["task"] = cleaned.strip(" .").capitalize()
                    tasks.append(task)
            elif task["deadline"] and tasks:
                # No verb, but we found a deadline (e.g. "and track deadline is Monday") 
                # (if "is" is seen as AUX and pos_ != "VERB")
                tasks[-1]["deadline"] = task["deadline"]
                    
    return tasks