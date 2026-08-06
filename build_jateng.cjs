const fs = require('fs');

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

async function main() {
    console.log("Fetching all of Jawa Tengah...");
    
    const dict = {}; // { "kabupaten": { "desa": "kecamatan" } }

    const kabs = await fetchJson(`https://emsifa.github.io/api-wilayah-indonesia/api/regencies/33.json`);
    
    let totalKec = 0;
    let totalDesa = 0;

    for (const kab of kabs) {
        const kabName = kab.name.replace(/^(KABUPATEN|KOTA)\s+/i, '').trim().toLowerCase();
        dict[kabName] = {};
        
        let count = 0;
        const kecs = await fetchJson(`https://emsifa.github.io/api-wilayah-indonesia/api/districts/${kab.id}.json`);
        
        for (const kec of kecs) {
            const kecName = kec.name.replace(/^(KECAMATAN)\s+/i, '').trim().toLowerCase();
            const desas = await fetchJson(`https://emsifa.github.io/api-wilayah-indonesia/api/villages/${kec.id}.json`);
            for (const d of desas) {
                const desaName = d.name.trim().toLowerCase();
                dict[kabName][desaName] = kecName;
                count++;
                totalDesa++;
            }
            totalKec++;
        }
        console.log(`Done Kab: ${kabName} (${kecs.length} kec, ${count} desa)`);
    }
    
    // Add alias for Purwokerto to map to Banyumas (since Nominatim sometimes returns Purwokerto as city)
    dict['purwokerto'] = dict['banyumas'];

    fs.writeFileSync('src/assets/desa_jateng.json', JSON.stringify(dict));
    console.log(`Done writing src/assets/desa_jateng.json. Total Kec: ${totalKec}, Total Desa: ${totalDesa}`);
}

main().catch(console.error);
