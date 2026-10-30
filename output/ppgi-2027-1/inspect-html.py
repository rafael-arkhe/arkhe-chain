from pathlib import Path
from html.parser import HTMLParser
class P(HTMLParser):
 def handle_starttag(self,t,a):
  d=dict(a)
  if t=='script' and 'src' in d:print(d['src'])
p=P();s=Path('output/ppgi-2027-1/textos/45c2ef5a.html').read_text();p.feed(s);print(s[-1800:])
