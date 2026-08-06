const lat = -7.5946027; const lon = 109.237261;
Promise.all([
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=id&zoom=13&addressdetails=1`, {headers:{'User-Agent':'test'}}).then(r=>r.json())
]).then(res => console.dir(res, {depth: null}));
