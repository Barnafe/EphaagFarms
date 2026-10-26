import re,glob
# crude static audit: inside a function that takes pool.connect(), flag pool.query / nested pool.connect before release
bad=[]
for f in glob.glob("**/*.js",recursive=True):
    s=open(f).read()
    for m in re.finditer(r'(\w+)\s*=\s*await pool\.connect\(\)',s):
        var=m.group(1); start=m.end()
        # region until the matching release (first "<var>.release()" after start)
        rel=s.find(var+".release()",start)
        region=s[start: rel if rel!=-1 else start+4000]
        for q in re.finditer(r'\bpool\.(query|connect)\(',region):
            line=s[:start+q.start()].count("\n")+1
            bad.append((f,line,q.group(0)))
print(len(bad),"suspect spots")
for b in bad: print(b)
