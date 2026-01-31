import pandas as pd
import os

file_path = r"c:\Users\kokon\Downloads\+Middle School Data Sheet+.xlsx"

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

try:
    xl = pd.ExcelFile(file_path)
    with open("analysis_output.txt", "w", encoding="utf-8") as f:
        f.write(f"File: {os.path.basename(file_path)}\n")
        f.write(f"Sheet names: {xl.sheet_names}\n")
        
        for sheet in xl.sheet_names:
            f.write(f"\n--- Sheet: {sheet} ---\n")
            df = xl.parse(sheet)
            f.write(f"Columns: {df.columns.tolist()}\n")
            f.write("First 5 rows:\n")
            f.write(df.head().to_string())
            f.write("\n")
except Exception as e:
    print(f"Error reading excel file: {e}")
