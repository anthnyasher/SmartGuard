import subprocess

with open("smartguard_packed.txt", "r", encoding="utf-8") as f:
    codebase = f.read()

question = "Explain the structure of this project"
prompt = f"{codebase}\n\n---\n\nQuestion: {question}"

result = subprocess.run(
    ["ollama", "run", "qwen3-coder-next:cloud"],
    input=prompt,
    capture_output=True,
    text=True
)
print(result.stdout)