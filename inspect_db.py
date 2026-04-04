import sys

with open('database.py', 'rb') as f:
    content = f.read()

lines = content.split(b'\r\n')
for i, line in enumerate(lines[96:106], start=97):
    print(f'{i}: {repr(line[:80])}')
