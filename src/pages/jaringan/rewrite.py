import os
import re

DIR = r"C:\Users\acer\.gemini\antigravity\scratch\maintory\maintory-app\src\pages\jaringan"

def rewrite_file(filename, js_state, js_ui):
    path = os.path.join(DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find the main return block. We look for the `return (` that is indented by 2 spaces and not inside a map.
    match = re.search(r'\n  return \(\n', content)
    if not match:
        print(f"Could not find return block in {filename}")
        return
    
    top_part = content[:match.start()]
    new_content = top_part + "\n" + js_ui
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Rewritten {filename}")

# Note: We will generate the JSX for each file according to the prompt's specifications.

