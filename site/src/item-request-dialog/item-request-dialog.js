import { BaseElement } from "../base-element/base-element";

export class ItemRequestDialog extends BaseElement {
  constructor() {
    super();
    this.item = null;
    this.memberQuantities = null;
    this.onConfirm = null;
    this.onCancel = null;
  }

  html() {
    return `{{item-request-dialog.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.eventListener(this.querySelector(".confirm-button"), "click", () => this.handleConfirm());
    this.eventListener(this.querySelector(".cancel-button"), "click", () => this.handleCancel());
    this.eventListener(this.querySelector(".dialog-backdrop"), "click", () => this.handleCancel());
    this.eventListener(this.querySelector(".dialog"), "click", (e) => e.stopPropagation());
    
    const quantityInput = this.querySelector(".quantity-input");
    this.eventListener(quantityInput, "input", () => this.updateQuantityValidation());
  }

  show(item, memberQuantities, onConfirm, onCancel) {
    this.item = item;
    this.memberQuantities = memberQuantities;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    this.updateDialog();
    this.querySelector(".dialog-backdrop").classList.add("dialog-backdrop--visible");
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

    const holdersListEl = this.querySelector(".holders-list");
    holdersListEl.innerHTML = "";

    const maxAvailable = Object.entries(this.memberQuantities)
      .filter(([member, qty]) => qty > 0 && member !== "@SHARED")
      .reduce((sum, [, qty]) => sum + qty, 0);

    if (maxAvailable === 0) {
      holdersListEl.innerHTML = '<div class="no-holders">No one has this item</div>';
      this.querySelector(".confirm-button").disabled = true;
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
    this.updateQuantityValidation();
  }

  updateQuantityValidation() {
    const quantityInput = this.querySelector(".quantity-input");
    const confirmButton = this.querySelector(".confirm-button");
    const value = parseInt(quantityInput.value) || 0;
    const max = parseInt(quantityInput.max) || 0;
    
    confirmButton.disabled = value <= 0 || value > max;
  }

  resetForm() {
    this.querySelector(".quantity-input").value = 1;
    this.querySelector(".note-input").value = "";
  }

  handleConfirm() {
    const quantity = parseInt(this.querySelector(".quantity-input").value) || 1;
    const note = this.querySelector(".note-input").value.trim();
    
    if (this.onConfirm) {
      this.onConfirm({
        item_id: this.item.id,
        item_name: this.item.name,
        quantity,
        note: note || undefined,
        member_quantities: this.memberQuantities,
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