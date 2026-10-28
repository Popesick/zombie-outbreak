#!/bin/bash
# usage: mktest.sh scriptfile  -> erzeugt test3.html (index.html + Testskript)
sed "s#</body>#<pre id=\"__res\"></pre><script src=\"$1\"></script></body>#" index.html > test3.html
