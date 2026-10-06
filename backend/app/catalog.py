"""A small, expandable field guide. Recognition uses the full model taxonomy."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def entry(id, name, scientific, category, rarity, fact, habitat, family, order, genus, tags, kingdom="Animalia", phylum="Chordata", cls="Aves"):
    photo = f"/specimens/{id}.jpg" if (ROOT / "public" / "specimens" / f"{id}.jpg").exists() else f"/specimens/{id}.svg"
    return dict(id=id, name=name, scientific=scientific, category=category, rarity=rarity, fact=fact,
                habitat=habitat, image=photo, tags=tags,
                taxonomy={"Kingdom": kingdom, "Phylum": phylum, "Class": cls, "Order": order, "Family": family, "Genus": genus, "Species": scientific})

CATALOG = [
    entry("neem", "Neem", "Azadirachta indica", "Plants", "Common", "A neem leaf is made up of many small leaflets, each with a distinctive toothed edge.", "Sunny roadsides & gardens", "Meliaceae", "Sapindales", "Azadirachta", ["tree"], "Plantae", "Tracheophyta", "Magnoliopsida"),
    entry("plain-tiger", "Plain tiger", "Danaus chrysippus", "Insects", "Uncommon", "Its bright orange wings warn predators that it can be unpleasant to eat.", "Open gardens & grasslands", "Nymphalidae", "Lepidoptera", "Danaus", ["butterfly", "pollinator"], phylum="Arthropoda", cls="Insecta"),
    entry("common-myna", "Common myna", "Acridotheres tristis", "Birds", "Common", "Mynas often walk across lawns in pairs, searching for insects with their bright yellow bills.", "Parks & urban green spaces", "Sturnidae", "Passeriformes", "Acridotheres", []),
    entry("hibiscus", "Chinese hibiscus", "Hibiscus rosa-sinensis", "Plants", "Common", "The long column in the centre of a hibiscus flower carries both pollen-producing anthers and the stigma.", "Gardens & sunny hedges", "Malvaceae", "Malvales", "Hibiscus", ["flower"], "Plantae", "Tracheophyta", "Magnoliopsida"),
    entry("peafowl", "Indian peafowl", "Pavo cristatus", "Birds", "Uncommon", "The male's spectacular train is made of elongated upper tail coverts, rather than its true tail feathers.", "Woodland edges & open scrub", "Phasianidae", "Galliformes", "Pavo", []),
    entry("honey-bee", "Asian honey bee", "Apis cerana", "Insects", "Common", "Honey bees communicate the direction and distance of food with a waggle dance.", "Flowers & gardens", "Apidae", "Hymenoptera", "Apis", ["bee", "pollinator"], phylum="Arthropoda", cls="Insecta"),
    entry("banyan", "Banyan", "Ficus benghalensis", "Plants", "Uncommon", "Aerial roots grow down from its branches and can become sturdy, trunk-like supports.", "Parks & village green spaces", "Moraceae", "Rosales", "Ficus", ["tree"], "Plantae", "Tracheophyta", "Magnoliopsida"),
    entry("rose-ringed-parakeet", "Rose-ringed parakeet", "Psittacula krameri", "Birds", "Common", "These bright green parakeets gather in noisy groups at their evening roosts.", "Tree-lined streets & parks", "Psittaculidae", "Psittaciformes", "Psittacula", []),
    entry("turkey-tail", "Turkey tail", "Trametes versicolor", "Fungi", "Uncommon", "This bracket fungus has tiny pores on its underside and helps break down dead wood.", "Fallen logs & woodland", "Polyporaceae", "Polyporales", "Trametes", [], "Fungi", "Basidiomycota", "Agaricomycetes"),
    entry("garden-lizard", "Oriental garden lizard", "Calotes versicolor", "Reptiles", "Common", "Garden lizards often perch on sunny branches and fence posts while watching for insects.", "Hedges & garden edges", "Agamidae", "Squamata", "Calotes", [], cls="Reptilia"),
    entry("marigold", "African marigold", "Tagetes erecta", "Plants", "Common", "What looks like one marigold flower is a cluster of many tiny flowers called a flower head.", "Sunny flower beds", "Asteraceae", "Asterales", "Tagetes", ["flower"], "Plantae", "Tracheophyta", "Magnoliopsida"),
    entry("lime-butterfly", "Lime butterfly", "Papilio demoleus", "Insects", "Uncommon", "Unlike many swallowtail butterflies, the lime butterfly has no long tails on its hindwings.", "Citrus gardens & open country", "Papilionidae", "Lepidoptera", "Papilio", ["butterfly", "pollinator"], phylum="Arthropoda", cls="Insecta"),
    entry("house-sparrow", "House sparrow", "Passer domesticus", "Birds", "Common", "House sparrows often nest in small openings in buildings, close to the people they live alongside.", "Neighbourhoods & farms", "Passeridae", "Passeriformes", "Passer", []),
    entry("sacred-fig", "Sacred fig", "Ficus religiosa", "Plants", "Common", "Its heart-shaped leaves have a long, slender tip that helps rainwater run off.", "Courtyards & roadsides", "Moraceae", "Rosales", "Ficus", ["tree"], "Plantae", "Tracheophyta", "Magnoliopsida"),
    entry("spotted-dove", "Spotted dove", "Spilopelia chinensis", "Birds", "Common", "Look for the black patch with white spots on the back of this dove's neck.", "Gardens & open woodland", "Columbidae", "Columbiformes", "Spilopelia", []),
    entry("common-grass-yellow", "Common grass yellow", "Eurema hecabe", "Insects", "Common", "These little yellow butterflies often fly close to the ground, stopping at small flowers.", "Grassy verges & clearings", "Pieridae", "Lepidoptera", "Eurema", ["butterfly", "pollinator"], phylum="Arthropoda", cls="Insecta"),
    entry("curry-tree", "Curry tree", "Murraya koenigii", "Plants", "Common", "Its aromatic leaves grow in pairs along a central stem, with one leaflet at the tip.", "Kitchen gardens", "Rutaceae", "Sapindales", "Murraya", ["tree"], "Plantae", "Tracheophyta", "Magnoliopsida"),
    entry("split-gill", "Split gill", "Schizophyllum commune", "Fungi", "Common", "Its tiny fan-shaped fruiting bodies have split gills that can close up in dry weather.", "Dead branches & fallen wood", "Schizophyllaceae", "Agaricales", "Schizophyllum", [], "Fungi", "Basidiomycota", "Agaricomycetes"),
]
BY_ID = {s["id"]: s for s in CATALOG}
BY_SCIENTIFIC = {s["scientific"].lower(): s for s in CATALOG}

EXPEDITIONS = [
    {"id": "pollinator", "title": "The pollinator hunt", "subtitle": "Small wings. A big role in our world.", "duration": 25, "xp": 350, "theme": "meadow", "goals": [
        {"label": "Find a flowering plant", "tag": "flower"},
        {"label": "Spot a butterfly", "tag": "butterfly"},
        {"label": "Discover a bee", "tag": "bee"}]},
    {"id": "backyard", "title": "Backyard beginnings", "subtitle": "An adventure, right on your doorstep.", "duration": 15, "xp": 200, "theme": "garden", "goals": [
        {"label": "Discover a plant", "category": "Plants"},
        {"label": "Look for a bird", "category": "Birds"},
        {"label": "Meet a tiny insect", "category": "Insects"}]},
    {"id": "woodland", "title": "Under the canopy", "subtitle": "Look up. Look down. Look a little closer.", "duration": 30, "xp": 300, "theme": "woodland", "goals": [
        {"label": "Identify a tree", "tag": "tree"},
        {"label": "Find a fungus on fallen wood", "category": "Fungi"},
        {"label": "Spot a bird in the branches", "category": "Birds"}]},
]
