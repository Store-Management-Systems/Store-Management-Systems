// ─── Dynamic Dropdown Handlers (Updated for Backend) ───────────────────────────

async function handleCatChange(sel) {
  if (sel.value === '__NEW__') {
    let newCat = prompt("Enter new category name:");
    if (newCat && newCat.trim() !== '') {
      newCat = newCat.trim();
      
      if (!state.categories.includes(newCat)) {
        try {
          // Send new category to backend
          const res = await fetch(`${API_URL}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newCat })
          });
          
          if (res.ok) {
            state.categories.push(newCat);
            toast('✅ Category added');
          } else {
            const data = await res.json();
            alert(data.message || 'Failed to add category');
            sel.value = sel.dataset.prev || (state.categories[0] || '');
            return;
          }
        } catch (e) {
          console.error(e);
          alert('Error connecting to server');
          sel.value = sel.dataset.prev || (state.categories[0] || '');
          return;
        }
      }
      
      sel.innerHTML = getCategoryOptions(newCat);
      sel.value = newCat;
      sel.dataset.prev = newCat;
    } else {
      sel.value = sel.dataset.prev || (state.categories[0] || '');
    }
  } else {
    sel.dataset.prev = sel.value;
  }
}

function handleUnitChange(sel) {
  if (sel.value === '__NEW__') {
    // Create inline mini-modal for adding a new unit
    const overlay = document.createElement('div');
    overlay.style = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;";
    
    overlay.innerHTML = `
      <div class="card fade-in" style="width:100%;max-width:320px;margin:0;padding:20px;box-shadow:0 8px 30px rgba(0,0,0,0.5);">
        <h3 style="margin-bottom:16px;text-align:center;">Add New Unit</h3>
        <div class="form-group">
          <label class="form-label">Unit Name</label>
          <input type="text" id="newUnitInput" placeholder="Unit name" maxlength="20">
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;">
          <button class="btn-primary" style="flex:1;" id="saveUnitBtn">Save</button>
          <button class="btn-secondary" style="flex:1;" id="cancelUnitBtn">Cancel</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const input = document.getElementById('newUnitInput');
    input.focus();

    const closeOverlay = () => document.body.removeChild(overlay);

    document.getElementById('cancelUnitBtn').onclick = () => {
      sel.value = sel.dataset.prev || (state.units[0] || '');
      closeOverlay();
    };

    document.getElementById('saveUnitBtn').onclick = async () => {
      let newUnit = input.value.trim();
      
      if (newUnit === '') {
        alert('Unit name cannot be empty.');
        return;
      }
      if (newUnit.length > 20) {
        alert('Unit name cannot exceed 20 characters.');
        return;
      }
      
      const exists = state.units.find(u => u.toLowerCase() === newUnit.toLowerCase());
      if (exists) {
        alert('This unit already exists.');
        sel.innerHTML = getUnitOptions(exists);
        sel.value = exists;
        sel.dataset.prev = exists;
        closeOverlay();
        return;
      }
      
      try {
        // Send new unit to backend
        const res = await fetch(`${API_URL}/units`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newUnit })
        });
        
        if (res.ok) {
          state.units.push(newUnit);
          sel.innerHTML = getUnitOptions(newUnit);
          sel.value = newUnit;
          sel.dataset.prev = newUnit;
          toast('✅ Unit added');
        } else {
          const data = await res.json();
          alert(data.message || 'Failed to add unit');
          sel.value = sel.dataset.prev || (state.units[0] || '');
        }
      } catch (e) {
        console.error(e);
        alert('Error connecting to server');
        sel.value = sel.dataset.prev || (state.units[0] || '');
      }
      
      closeOverlay();
    };

    // Support Enter key submission
    input.onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('saveUnitBtn').click();
    };
    
  } else {
    sel.dataset.prev = sel.value;
  }
}