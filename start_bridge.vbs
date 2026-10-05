Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\om prakash\.gemini\antigravity\scratch\whatsapp-sheets-bridge"
WshShell.Run "cmd /c node index.js", 0, False
