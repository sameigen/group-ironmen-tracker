import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";

export class ItemRequestDialog extends BaseElement {
  constructor() {
    super();
    this.item = null;
    this.memberQuantities = null;
    this.onConfirm = null;
    this.onCancel = null;
    this.preselectedRequester = null;
  }

  html() {
    return `{{item-request-dialog.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  setupEventListeners() {
    this.eventListener(this.querySelector(".confirm-button"), "click", () => this.handleConfirm());
    this.eventListener(this.querySelector(".cancel-button"), "click", () => this.handleCancel());
    this.eventListener(this.querySelector(".dialog-backdrop"), "click", () => this.handleCancel());
    this.eventListener(this.querySelector(".dialog-box"), "click", (e) => e.stopPropagation());
    
    const quantityInput = this.querySelector(".quantity-input");
    this.eventListener(quantityInput, "input", () => this.updateValidation());
    
    const requesterSelect = this.querySelector(".requester-select");
    this.eventListener(requesterSelect, "change", () => this.updateValidation());
  }

  show(item, memberQuantities, onConfirm, onCancel, preselectedRequester = null) {
    this.item = item;
    this.memberQuantities = memberQuantities;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.preselectedRequester = preselectedRequester;

    // Render the dialog first
    this.render();
    
    // Setup event listeners after rendering
    this.setupEventListeners();
    
    // Then update with data
    this.updateDialog();
    
    // Finally show the backdrop
    const backdrop = this.querySelector(".dialog-backdrop");
    if (backdrop) {
      backdrop.classList.add("dialog-backdrop--visible");
    }
  }

  hide() {
    this.querySelector(".dialog-backdrop").classList.remove("dialog-backdrop--visible");
    setTimeout(() => {
      this.item = null;
      this.memberQuantities = null;
      this.onConfirm = null;
      this.onCancel = null;
      this.resetForm();
    }, 300);
  }

  updateDialog() {
    const itemNameEl = this.querySelector(".item-name");
    itemNameEl.textContent = this.item.name;

    // Populate requester dropdown
    const requesterSelect = this.querySelector(".requester-select");
    requesterSelect.innerHTML = '<option value="">Select your name...</option>';
    
    // Get all members from groupData
    const members = Array.from(groupData.members.values());
    members.forEach(member => {
      const option = document.createElement("option");
      option.value = member.name;
      option.textContent = member.name;
      if (this.preselectedRequester === member.name) {
        option.selected = true;
      }
      requesterSelect.appendChild(option);
    });

    const holdersListEl = this.querySelector(".holders-list");
    holdersListEl.innerHTML = "";

    const maxAvailable = Object.entries(this.memberQuantities)
      .filter(([member, qty]) => qty > 0 && member !== "@SHARED")
      .reduce((sum, [, qty]) => sum + qty, 0);

    if (maxAvailable === 0) {
      holdersListEl.innerHTML = '<div class="no-holders">No one has this item</div>';
      this.updateValidation();
      return;
    }

    Object.entries(this.memberQuantities)
      .filter(([member, qty]) => qty > 0 && member !== "@SHARED")
      .forEach(([member, qty]) => {
        const holderEl = document.createElement("div");
        holderEl.className = "holder-item";
        holderEl.innerHTML = `<span class="holder-name">${member}:</span> <span class="holder-quantity">${qty.toLocaleString()}</span>`;
        holdersListEl.appendChild(holderEl);
      });

    const quantityInput = this.querySelector(".quantity-input");
    quantityInput.max = maxAvailable;
    quantityInput.value = 1;
    this.updateValidation();
  }

  updateValidation() {
    const quantityInput = this.querySelector(".quantity-input");
    const requesterSelect = this.querySelector(".requester-select");
    const confirmButton = this.querySelector(".confirm-button");
    const value = parseInt(quantityInput.value) || 0;
    const max = parseInt(quantityInput.max) || 0;
    
    confirmButton.disabled = value <= 0 || value > max || !requesterSelect.value;
  }

  resetForm() {
    this.querySelector(".quantity-input").value = 1;
    this.querySelector(".note-input").value = "";
    this.querySelector(".requester-select").value = "";
  }

  handleConfirm() {
    const quantity = parseInt(this.querySelector(".quantity-input").value) || 1;
    const note = this.querySelector(".note-input").value.trim();
    const requesterName = this.querySelector(".requester-select").value;
    
    if (this.onConfirm) {
      this.onConfirm({
        item_id: this.item.id,
        item_name: this.item.name,
        quantity,
        note: note || undefined,
        member_quantities: this.memberQuantities,
        requester_name: requesterName,
      });
    }
    this.hide();
  }

  handleCancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.hide();
  }
}

customElements.define("item-request-dialog", ItemRequestDialog);