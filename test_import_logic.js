import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  import('fs').then(fs => {
    const env = fs.readFileSync('.env', 'utf8')
    const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/)
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)
    if (urlMatch && keyMatch) {
      const sb = createClient(urlMatch[1], keyMatch[1])
      test(sb)
    }
  })
} else {
  const sb = createClient(supabaseUrl, supabaseKey)
  test(sb)
}

async function test(sb) {
  console.log("Fetching brands...")
  const { data: brands, error: err1 } = await sb.from('ont_brands').select('*')
  console.log("Brands count:", brands?.length, err1)
  
  if (brands) {
    const data = [
      { 'Serial Number': 'TEST1', 'Merk': 'V5', 'Tipe': 'F670L' },
      { 'Serial Number': 'TEST2', 'Merk': 'ONT HUAWEI V5 FULLSET PORT BIRU', 'Tipe': 'V5 FULLSET' }
    ]
    
    const uniqueBrands = [...new Set(data.map(r => String(r['Merk'] || '').trim()).filter(Boolean))]
    console.log("Unique brands from data:", uniqueBrands)
    
    const brandMap = {}
    brands.forEach(b => { brandMap[b.brand_name.toLowerCase()] = b.id })
    console.log("Initial Brand Map Keys:", Object.keys(brandMap))
    
    for (const bName of uniqueBrands) {
      const lowerName = bName.toLowerCase()
      if (!brandMap[lowerName] && bName !== '-') {
         console.log("Need to insert brand:", bName)
         const { data: newBrand, error } = await sb.from('ont_brands').insert([{ brand_name: bName }]).select().single()
         if (error) {
           console.log("ERROR inserting:", bName, error)
         } else {
           console.log("Inserted brand:", newBrand)
           brandMap[lowerName] = newBrand.id
         }
      } else {
         console.log("Brand already exists or is '-':", bName)
      }
    }
    
    console.log("Final Brand Map for Huawei:", brandMap['ont huawei v5 fullset port biru'])
  }
}
