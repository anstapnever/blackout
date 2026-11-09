"""Replace the As mixed part of cuesheet.md with the table printed by tools/cuesheet.py."""
import os, subprocess, sys
A = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tab = subprocess.run([sys.executable, '-I', os.path.join(A, 'tools', 'cuesheet.py')], capture_output=True, encoding='utf-8', check=True).stdout
p = os.path.join(A, 'cuesheet.md')
s = open(p, encoding='utf-8').read()
s = s[:s.index('## As mixed')] + '## As mixed\nGenerated from what the renderer played and the measured levels.\n\n' + tab
open(p, 'w', encoding='utf-8').write(s)
