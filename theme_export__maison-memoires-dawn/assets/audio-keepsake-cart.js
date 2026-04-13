if (!customElements.get('audio-keepsake-cart-panel')) {
  class AudioKeepsakeCartPanel extends HTMLElement {
    static updateCheckoutState() {
      const panels = Array.from(document.querySelectorAll('audio-keepsake-cart-panel'));
      const shouldLockCheckout = panels.some((panel) => panel.isSaving || !panel.isPersistedComplete());

      const checkoutButton = document.getElementById('checkout');
      if (checkoutButton) {
        const cartEmpty = checkoutButton.dataset.cartEmpty === 'true';
        checkoutButton.disabled = cartEmpty || shouldLockCheckout;
      }

      document.querySelectorAll('[data-audio-checkout-note]').forEach((note) => {
        note.hidden = !shouldLockCheckout;
      });

      document.querySelectorAll('.cart__dynamic-checkout-buttons').forEach((container) => {
        container.hidden = shouldLockCheckout;
      });
    }

    constructor() {
      super();
      this.handleInput = this.handleInput.bind(this);
      this.handleSave = this.handleSave.bind(this);
    }

    connectedCallback() {
      this.line = this.dataset.line;
      this.lineKey = this.dataset.lineKey || '';
      this.variantId = this.dataset.variantId || '';
      this.quantity = this.dataset.quantity || '1';
      this.mode = this.dataset.mode || '';
      this.isSaving = false;

      this.needsFile = this.mode === 'voice' || this.mode === 'voice_music';
      this.needsBrief = this.mode === 'ai' || this.mode === 'voice_music';

      this.fileInput = this.querySelector('[data-file-input]');
      this.briefInput = this.querySelector('[data-brief-input]');
      this.notesInput = this.querySelector('[data-notes-input]');
      this.saveButton = this.querySelector('[data-save-button]');
      this.messageElement = this.querySelector('[data-form-message]');
      this.statusBadge = this.querySelector('[data-status-badge]');
      this.statusText = this.querySelector('[data-status-text]');
      this.savedFileState = this.querySelector('[data-file-saved-state]');

      this.existingProperties = this.parseProperties(this.dataset.existingProperties);
      this.existingFileValue = this.existingProperties['Fichier audio'] || '';
      this.existingBriefValue = this.existingProperties['Brief créatif'] || '';

      this.fileInput?.addEventListener('change', this.handleInput);
      this.briefInput?.addEventListener('input', this.handleInput);
      this.notesInput?.addEventListener('input', this.handleInput);
      this.saveButton?.addEventListener('click', this.handleSave);

      this.refreshUI();
      this.restoreFlashMessage();
      this.constructor.updateCheckoutState();
    }

    disconnectedCallback() {
      this.fileInput?.removeEventListener('change', this.handleInput);
      this.briefInput?.removeEventListener('input', this.handleInput);
      this.notesInput?.removeEventListener('input', this.handleInput);
      this.saveButton?.removeEventListener('click', this.handleSave);
    }

    parseProperties(rawValue) {
      try {
        return JSON.parse(rawValue || '{}') || {};
      } catch (error) {
        console.error(error);
        return {};
      }
    }

    handleInput() {
      this.hideMessage();
      this.refreshUI();
      this.constructor.updateCheckoutState();
    }

    async handleSave() {
      const validationMessage = this.getValidationMessage();
      if (validationMessage) {
        this.showMessage(validationMessage, 'error');
        this.focusFirstInvalidField();
        return;
      }

      this.isSaving = true;
      this.hideMessage();
      this.refreshUI();
      this.constructor.updateCheckoutState();

      if (this.saveButton) {
        this.saveButton.disabled = true;
        this.saveButton.textContent = 'Enregistrement...';
      }

      try {
        const properties = this.buildProperties();
        const finalState = await this.replaceLineItem(properties);
        const itemKey = this.findItemKey(finalState, properties.__audio_keepsake_revision);

        this.constructor.flashMessage = {
          itemKey,
          type: 'success',
          text: this.dataset.successMessage,
        };

        this.renderSections(finalState);
      } catch (error) {
        console.error(error);
        this.showMessage(error.message || this.dataset.genericErrorMessage, 'error');
      } finally {
        this.isSaving = false;

        if (this.isConnected && this.saveButton) {
          this.saveButton.disabled = false;
        }

        this.refreshUI();
        this.constructor.updateCheckoutState();
      }
    }

    buildProperties() {
      const properties = { ...this.existingProperties };
      const managedKeys = [
        'Fichier audio',
        'Brief créatif',
        'Notes complémentaires',
        '_audio_mode',
        '__audio_keepsake_complete',
        '__audio_keepsake_revision',
      ];

      managedKeys.forEach((key) => {
        delete properties[key];
      });

      if (this.hasTextValue(this.briefInput)) {
        properties['Brief créatif'] = this.briefInput.value.trim();
      }

      if (this.hasTextValue(this.notesInput)) {
        properties['Notes complémentaires'] = this.notesInput.value.trim();
      }

      if (!this.fileInput?.files?.length && this.existingFileValue) {
        properties['Fichier audio'] = this.existingFileValue;
      }

      properties._audio_mode = this.mode;
      properties.__audio_keepsake_complete = this.hasCurrentRequiredData() ? 'Oui' : 'Non';
      properties.__audio_keepsake_revision = `${Date.now()}-${Math.round(Math.random() * 1000)}`;

      return properties;
    }

    async replaceLineItem(properties) {
      if (!this.variantId || !this.lineKey) {
        throw new Error(this.dataset.genericErrorMessage);
      }

      const addFormData = new FormData();
      addFormData.append('id', this.variantId);
      addFormData.append('quantity', this.quantity);

      Object.entries(properties).forEach(([key, value]) => {
        if (value === null || typeof value === 'undefined') return;

        const normalizedValue = value.toString().trim();
        if (!normalizedValue) return;

        addFormData.append(`properties[${key}]`, value);
      });

      if (this.fileInput?.files?.[0]) {
        addFormData.set('properties[Fichier audio]', this.fileInput.files[0]);
      }

      const addResponse = await fetch(routes.cart_add_url, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: addFormData,
      });
      const addedItem = await this.parseJsonResponse(addResponse);

      if (!addResponse.ok || addedItem.status || addedItem.errors) {
        throw new Error(addedItem.description || addedItem.errors || this.dataset.genericErrorMessage);
      }

      const removeBody = JSON.stringify({
        id: this.lineKey,
        quantity: 0,
        sections: this.getSectionsToRender().map((section) => section.section),
        sections_url: window.location.pathname,
      });
      const removeResponse = await fetch(routes.cart_change_url, { ...fetchConfig(), body: removeBody });
      const finalState = await this.parseJsonResponse(removeResponse);

      if (!removeResponse.ok || finalState.errors) {
        await this.rollbackAddedItem(addedItem.key);
        throw new Error(finalState.errors || this.dataset.genericErrorMessage);
      }

      finalState.__audioAddedItemKey = addedItem.key || '';

      return finalState;
    }

    async rollbackAddedItem(itemKey) {
      if (!itemKey) return;

      try {
        const rollbackBody = JSON.stringify({
          id: itemKey,
          quantity: 0,
        });

        await fetch(routes.cart_change_url, { ...fetchConfig(), body: rollbackBody });
      } catch (error) {
        console.error(error);
      }
    }

    async parseJsonResponse(response) {
      const responseText = await response.text();

      try {
        return responseText ? JSON.parse(responseText) : {};
      } catch (error) {
        console.error(error);
        throw new Error(this.dataset.genericErrorMessage);
      }
    }

    getSectionsToRender() {
      const sections = [];
      const mainCartItems = document.getElementById('main-cart-items');
      const mainCartFooter = document.getElementById('main-cart-footer');

      if (mainCartItems?.dataset.id) {
        sections.push({
          id: 'main-cart-items',
          section: mainCartItems.dataset.id,
          selector: '.js-contents',
        });
      }

      if (mainCartFooter?.dataset.id) {
        sections.push({
          id: 'main-cart-footer',
          section: mainCartFooter.dataset.id,
          selector: '.js-contents',
        });
      }

      sections.push(
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section',
        },
        {
          id: 'cart-live-region-text',
          section: 'cart-live-region-text',
          selector: '.shopify-section',
        }
      );

      return sections;
    }

    renderSections(parsedState) {
      this.getSectionsToRender().forEach((section) => {
        const targetContainer = document.getElementById(section.id);
        const sourceHtml = parsedState.sections?.[section.section];

        if (!targetContainer || !sourceHtml) return;

        const parsedDocument = new DOMParser().parseFromString(sourceHtml, 'text/html');
        const sourceElement = parsedDocument.querySelector(section.selector);
        const elementToReplace = targetContainer.querySelector(section.selector) || targetContainer;

        if (!sourceElement || !elementToReplace) return;

        elementToReplace.innerHTML = sourceElement.innerHTML;
      });
    }

    findItemKey(parsedState, revision) {
      const matchedItem = parsedState?.items?.find(
        (item) => item.properties?.__audio_keepsake_revision === revision
      );

      return matchedItem?.key || parsedState.__audioAddedItemKey || '';
    }

    restoreFlashMessage() {
      const message = this.constructor.flashMessage;
      if (!message) return;
      if (message.itemKey && message.itemKey !== this.lineKey) return;

      this.showMessage(message.text, message.type);
      this.constructor.flashMessage = null;
    }

    refreshUI() {
      this.updateStatus();
      this.updateSavedFileState();

      if (!this.saveButton) return;

      if (this.isSaving) {
        this.saveButton.textContent = 'Enregistrement...';
        return;
      }

      this.saveButton.textContent = this.isPersistedComplete()
        ? 'Mettre à jour la personnalisation'
        : 'Enregistrer ma personnalisation';
    }

    updateStatus() {
      if (!this.statusBadge || !this.statusText) return;

      if (this.isPersistedComplete()) {
        this.statusBadge.textContent = 'Prêt pour la suite';
        this.statusText.textContent =
          'Vos informations principales sont bien enregistrées. Vous pouvez encore les ajuster si besoin.';
        return;
      }

      if (this.hasCurrentRequiredData()) {
        this.statusBadge.textContent = 'Prêt à enregistrer';
        this.statusText.textContent =
          "Les éléments indispensables sont prêts. Enregistrez-les pour déverrouiller le paiement.";
        return;
      }

      this.statusBadge.textContent = 'À compléter';
      this.statusText.textContent =
        "Le paiement restera verrouillé tant que les éléments indispensables n'auront pas été enregistrés.";
    }

    updateSavedFileState() {
      if (!this.savedFileState) return;

      if (this.fileInput?.files?.[0]) {
        this.savedFileState.innerHTML = `
          <span class="audio-keepsake-cart__saved-label">Nouveau fichier prêt</span>
          <span>${this.escapeHtml(this.fileInput.files[0].name)}</span>
        `;
        return;
      }

      if (this.existingFileValue) {
        const fileName = this.existingFileValue.split('/').pop();
        if (this.existingFileValue.includes('/uploads/')) {
          this.savedFileState.innerHTML = `
            <span class="audio-keepsake-cart__saved-label">Fichier enregistré</span>
            <a href="${this.escapeHtml(this.existingFileValue)}" class="link" target="_blank" rel="noopener">${this.escapeHtml(fileName)}</a>
          `;
        } else {
          this.savedFileState.innerHTML = `
            <span class="audio-keepsake-cart__saved-label">Fichier enregistré</span>
            <span>${this.escapeHtml(this.existingFileValue)}</span>
          `;
        }
        return;
      }

      this.savedFileState.innerHTML =
        '<span class="audio-keepsake-cart__saved-label">Aucun fichier enregistré pour le moment</span>';
    }

    isPersistedComplete() {
      return this.dataset.complete === 'true';
    }

    hasCurrentRequiredData() {
      const hasFile = !this.needsFile || Boolean(this.fileInput?.files?.length || this.existingFileValue);
      const hasBrief = !this.needsBrief || Boolean(this.briefInput?.value?.trim() || this.existingBriefValue);
      return hasFile && hasBrief;
    }

    hasTextValue(input) {
      return Boolean(input?.value && input.value.trim());
    }

    getValidationMessage() {
      if (this.needsFile && !this.fileInput?.files?.length && !this.existingFileValue) {
        return this.dataset.requiredFileMessage;
      }

      if (this.needsBrief && !this.briefInput?.value?.trim() && !this.existingBriefValue) {
        return this.dataset.requiredBriefMessage;
      }

      return '';
    }

    focusFirstInvalidField() {
      if (this.needsFile && !this.fileInput?.files?.length && !this.existingFileValue) {
        this.fileInput?.focus();
        return;
      }

      if (this.needsBrief && !this.briefInput?.value?.trim() && !this.existingBriefValue) {
        this.briefInput?.focus();
      }
    }

    showMessage(message, type) {
      if (!this.messageElement) return;

      this.messageElement.textContent = message;
      this.messageElement.hidden = false;
      this.messageElement.classList.remove('is-error', 'is-success');
      this.messageElement.classList.add(type === 'success' ? 'is-success' : 'is-error');
    }

    hideMessage() {
      if (!this.messageElement) return;

      this.messageElement.hidden = true;
      this.messageElement.textContent = '';
      this.messageElement.classList.remove('is-error', 'is-success');
    }

    escapeHtml(value) {
      const div = document.createElement('div');
      div.textContent = value || '';
      return div.innerHTML;
    }
  }

  AudioKeepsakeCartPanel.flashMessage = null;

  customElements.define('audio-keepsake-cart-panel', AudioKeepsakeCartPanel);
}
