const fs = require('fs');

let content = fs.readFileSync('src/pages/dismantle/Dismantle.jsx', 'utf8');

// 1. Import createPortal
if (!content.includes('import { createPortal }')) {
  content = content.replace(
    `import { useState, useEffect } from 'react'`,
    `import { useState, useEffect } from 'react'\nimport { createPortal } from 'react-dom'`
  );
}

// 2. Wrap isModalOpen
if (!content.includes('createPortal(')) {
  const modalTarget = `{isModalOpen && (
        <div className="modal-overlay">`;
  const modalReplacement = `{isModalOpen && createPortal(
        <div className="modal-overlay">`;
  content = content.replace(modalTarget, modalReplacement);

  const closeTarget = `{isCloseModalOpen && (
        <div className="modal-overlay">`;
  const closeReplacement = `{isCloseModalOpen && createPortal(
        <div className="modal-overlay">`;
  content = content.replace(closeTarget, closeReplacement);

  // We need to close the portal tag for both: `)}` -> `, document.body)}`
  // But wait, there are exactly two modals at the bottom of the file.
  // We can just replace the end of the file.
  const endTarget = `          </div>
        </div>
      )}
    </div>
  )
}`;
  const endReplacement = `          </div>
        </div>
      ), document.body)}
    </div>
  )
}`;
  content = content.replace(endTarget, endReplacement);
  
  // What about the first modal? It ends before the second modal starts.
  const endFirstTarget = `            </div>
          </div>
        </div>
      )}

      {isCloseModalOpen`;
  const endFirstReplacement = `            </div>
          </div>
        </div>
      ), document.body)}

      {isCloseModalOpen`;
  content = content.replace(endFirstTarget, endFirstReplacement);
}

fs.writeFileSync('src/pages/dismantle/Dismantle.jsx', content);
console.log('Done wrapping with createPortal');
