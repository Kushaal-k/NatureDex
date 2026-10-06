"""Original, offline SVG specimen illustrations; no remote image dependency."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from backend.app.catalog import CATALOG

target = root / "public" / "specimens"
target.mkdir(parents=True, exist_ok=True)

def leaves(color="#608253", long=False):
    shapes = '<path d="M149 215Q156 140 143 56" stroke="#445f40" stroke-width="4" fill="none"/>'
    for i in range(6):
        y = 80+i*21
        width = 65 if long else 49
        shapes += f'<path d="M149 {y+17}Q{149-width} {y+14} {133-width} {y-13}Q132 {y-20} 149 {y+17}Z" fill="{color}"/><path d="M149 {y+17}Q{149+width} {y+14} {165+width} {y-13}Q166 {y-20} 149 {y+17}Z" fill="{color}"/><path d="m149 {y+17}-43-20m43 20 43-20" stroke="#d0d9a9" opacity=".55" fill="none"/>'
    return shapes

def flower(color):
    shapes = '<path d="M152 225Q132 181 151 126" stroke="#597846" stroke-width="5" fill="none"/><path d="M146 187Q91 171 91 146Q140 139 146 187Z" fill="#819c63"/><path d="M149 203Q198 167 206 177Q190 210 149 203Z" fill="#5c7e4d"/>'
    for angle in range(0, 360, 72):
        shapes += f'<ellipse cx="150" cy="84" rx="28" ry="43" transform="rotate({angle} 150 121)" fill="{color}"/>'
    return shapes+'<circle cx="150" cy="121" r="16" fill="#d9a548"/><path d="m150 121 28-46" stroke="#e7c86a" stroke-width="5"/><circle cx="179" cy="73" r="7" fill="#eac960"/>'

def butterfly(color):
    return f'<g transform="translate(0 -4)"><path d="M149 138C82 137 31 63 69 50C106 38 133 87 149 122Z" fill="{color}" stroke="#4d493e" stroke-width="5"/><path d="M153 138C220 137 271 63 233 50C196 38 169 87 153 122Z" fill="{color}" stroke="#4d493e" stroke-width="5"/><path d="M148 141C96 129 70 188 96 205C125 219 145 177 148 141ZM154 141C206 129 232 188 206 205C177 219 157 177 154 141Z" fill="{color}" stroke="#4d493e" stroke-width="5"/><path d="m148 141-64-76m69 76 65-76m-69 76-41 47m46-47 39 47" stroke="#544d3b" stroke-width="3"/><ellipse cx="151" cy="139" rx="7" ry="43" fill="#403f34"/><path d="m149 108-13-23m17 23 13-23" stroke="#403f34" fill="none" stroke-width="2"/><g fill="#f2e6c9"><circle cx="78" cy="69" r="5"/><circle cx="94" cy="77" r="4"/><circle cx="222" cy="69" r="5"/><circle cx="205" cy="77" r="4"/><circle cx="102" cy="188" r="4"/><circle cx="199" cy="188" r="4"/></g></g>'

def bird(color, parakeet=False):
    return f'<path d="M54 214Q161 199 242 212" stroke="#84755e" stroke-width="8" fill="none" stroke-linecap="round"/><path d="m145 194-5 14m20-14 5 15" stroke="#b29a4c" stroke-width="4"/><path d="M152 199Q198 188 205 122Q210 92 188 78Q167 68 155 87Q144 104 128 110Q82 134 104 169L60 188L112 184Q133 208 152 199Z" fill="{color}"/><path d="M127 124Q188 106 176 162Q153 193 120 167Z" fill="#f0e4c2" opacity=".34"/><path d="M200 110l24 7-23 9Z" fill="{ '#b44f3c' if parakeet else '#cca94e' }"/><circle cx="189" cy="102" r="5" fill="#f2dda1"/><circle cx="190" cy="102" r="2.5" fill="#282e27"/><path d="M159 130Q139 160 115 158" fill="none" stroke="#303f32" stroke-width="2" opacity=".5"/>'

def mushroom():
    return '<path d="M95 222q30-52 19-95h35q-8 43 24 95Z" fill="#d3bd99"/><path d="M53 132Q69 58 128 65Q187 60 206 133Q160 154 53 132Z" fill="#9d7150"/><path d="M68 127Q129 147 191 129" stroke="#e2c8a1" fill="none" stroke-width="8"/><path d="M141 217q32-42 25-62h25q-9 27 6 59Z" fill="#e4d0ab"/><path d="M136 158Q149 107 179 114Q211 112 227 158Z" fill="#b69170"/><path d="M64 224Q156 206 237 224" stroke="#7c8a58" fill="none" stroke-width="5"/><g fill="#d6b694"><circle cx="114" cy="86" r="5"/><circle cx="154" cy="102" r="6"/><circle cx="85" cy="112" r="4"/></g>'

def bee():
    return '<path d="M47 213Q171 163 244 205" fill="none" stroke="#81975e" stroke-width="3"/><ellipse cx="152" cy="91" rx="22" ry="38" transform="rotate(-30 152 91)" fill="#e2e7d9" stroke="#becbb8" stroke-width="2"/><ellipse cx="193" cy="92" rx="20" ry="37" transform="rotate(29 193 92)" fill="#f4f2dd" stroke="#becbb8" stroke-width="2"/><ellipse cx="148" cy="144" rx="46" ry="32" fill="#d7a446" transform="rotate(-12 148 144)"/><path d="m124 119 12 57m8-64 13 61m7-60 9 51" stroke="#564b39" stroke-width="12"/><circle cx="193" cy="133" r="23" fill="#564b39"/><circle cx="201" cy="130" r="5" fill="#f7e8c1"/><path d="m203 114 12-13m-22 10 3-20m-39 78-5 16m-18-15-12 18" stroke="#564b39" fill="none" stroke-width="3"/>'

def lizard():
    return '<path d="M68 209Q3 162 73 153Q118 150 169 115Q206 89 223 120L199 140Q160 195 94 172Q47 163 68 209Z" fill="#a49261"/><path d="m123 152-21-31-18 4m68 14 11-38 18-7m-55 65 22 29 19-2m5-33 27 21 12-5" stroke="#a49261" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M77 154Q138 166 188 123" stroke="#6c7750" fill="none" stroke-width="4"/><circle cx="210" cy="116" r="4" fill="#343c30"/>'

for species in CATALOG:
    sid = species["id"]
    category = species["category"]
    bg = {"Plants": "#e9eddf", "Birds": "#e7eced", "Insects": "#f1eadc", "Fungi": "#eee5dc", "Reptiles": "#e9eadc"}[category]
    if category == "Plants":
        art = flower("#d77b6e" if sid == "hibiscus" else "#e4af50") if "flower" in species["tags"] else leaves("#68895d" if sid != "curry-tree" else "#497553", sid == "neem")
    elif category == "Insects":
        art = bee() if sid == "honey-bee" else butterfly("#d69b52" if sid == "plain-tiger" else "#d7c87b" if sid == "lime-butterfly" else "#e2ca53")
    elif category == "Birds":
        art = bird({"peafowl": "#457d85", "rose-ringed-parakeet": "#83a364", "common-myna": "#69604c", "house-sparrow": "#977d60"}.get(sid, "#929381"), sid == "rose-ringed-parakeet")
    elif category == "Fungi":
        art = mushroom()
    else:
        art = lizard()
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260"><rect width="300" height="260" fill="{bg}"/><circle cx="150" cy="132" r="94" fill="#fff" opacity=".22"/>{art}</svg>'
    (target / f"{sid}.svg").write_text(svg, encoding="utf-8")
(target / "unknown.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260"><rect width="300" height="260" fill="#e9eddf"/>{leaves()}</svg>', encoding="utf-8")
print(f"Created {len(CATALOG)+1} original specimen illustrations.")
