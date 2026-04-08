if (!customElements.get('audio-keepsake-form')) {
  customElements.define(
    'audio-keepsake-form',
    class AudioKeepsakeForm extends HTMLElement {
      constructor() {
        super();
        this.handleChange = this.handleChange.bind(this);
        this.handleSubmitCapture = this.handleSubmitCapture.bind(this);
      }

      connectedCallback() {
        this.productInfo = this.closest('product-info');
        this.form = this.closest('form');

        if (!this.productInfo || !this.form) return;

        this.modeInput = this.querySelector('[data-audio-mode-input]');
        this.errorBox = this.querySelector('[data-audio-form-error]');
        this.fileInput = this.querySelector('[data-file-input]');
        this.briefInput = this.querySelector('[data-brief-input]');
        this.summaryFields = {
          audioType: this.querySelector('[data-summary-field="audio_type"]'),
          duration: this.querySelector('[data-summary-field="duration"]'),
          packaging: this.querySelector('[data-summary-field="packaging"]'),
          fileStatus: this.querySelector('[data-summary-field="file_status"]'),
          briefStatus: this.querySelector('[data-summary-field="brief_status"]'),
        };

        this.productInfo.addEventListener('change', this.handleChange);
        this.form.addEventListener('submit', this.handleSubmitCapture, true);

        this.syncFromState();
      }

      disconnectedCallback() {
        this.productInfo?.removeEventListener('change', this.handleChange);
        this.form?.removeEventListener('submit', this.handleSubmitCapture, true);
      }

      handleChange(event) {
        if (event.target.matches('[data-personalization-input]')) {
          event.target.setCustomValidity('');
          this.hideError();
        }

        window.requestAnimationFrame(() => this.syncFromState());
      }

      handleSubmitCapture(event) {
        this.hideError();
        this.clearCustomValidity();

        const state = this.getCurrentState();

        if (!state.mode) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.showError(this.dataset.missingModeMessage);
          return;
        }

        const firstInvalidInput = this.getVisibleRequiredInputs().find((input) => !this.hasValue(input));

        if (!firstInvalidInput) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        firstInvalidInput.setCustomValidity(this.getRequiredMessage(firstInvalidInput));
        firstInvalidInput.reportValidity();
        firstInvalidInput.focus();
      }

      syncFromState() {
        const state = this.getCurrentState();

        if (this.modeInput) this.modeInput.value = state.mode;

        this.updateGroups(state.mode);
        this.updateSummary(state);
      }

      getCurrentState() {
        const values = this.getVariantValues();
        const audioType = values[0] || '';
        const duration = values[1] || '';
        const packaging = values[2] || '';

        return {
          audioType,
          duration,
          packaging,
          mode: this.resolveMode(audioType),
        };
      }

      getVariantValues() {
        const variantSelects = this.productInfo?.querySelector('variant-selects');
        if (!variantSelects) return [];

        return Array.from(variantSelects.children)
          .filter((element) => element.matches('fieldset, .product-form__input--dropdown'))
          .map((element) => {
            if (element.tagName === 'FIELDSET') {
              return element.querySelector('input:checked')?.value || '';
            }

            return element.querySelector('select')?.value || '';
          });
      }

      updateGroups(mode) {
        const groups = this.querySelectorAll('[data-audio-role]');

        groups.forEach((group) => {
          const role = group.dataset.audioRole;
          const active = this.isRoleActiveForMode(role, mode);

          group.hidden = !active;

          group.querySelectorAll('[data-personalization-input]').forEach((input) => {
            const requiredModes = (input.dataset.requiredModes || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);

            input.disabled = !active;
            input.required = active && requiredModes.includes(mode);

            if (!active) {
              input.setCustomValidity('');
            }
          });
        });

        const fileRow = this.querySelector('[data-summary-row="file"]');
        const briefRow = this.querySelector('[data-summary-row="brief"]');

        if (fileRow) fileRow.hidden = !this.isRoleActiveForMode('file', mode);
        if (briefRow) briefRow.hidden = !this.isRoleActiveForMode('brief', mode);
      }

      updateSummary(state) {
        this.setText(this.summaryFields.audioType, state.audioType || this.dataset.defaultChoiceLabel);
        this.setText(this.summaryFields.duration, state.duration || this.dataset.defaultChoiceLabel);
        this.setText(this.summaryFields.packaging, state.packaging || this.dataset.defaultChoiceLabel);

        if (this.summaryFields.fileStatus) {
          const fileName = this.fileInput?.files?.[0]?.name;
          this.setText(this.summaryFields.fileStatus, fileName || this.dataset.fileMissingLabel);
        }

        if (this.summaryFields.briefStatus) {
          const hasBrief = this.hasValue(this.briefInput);
          this.setText(
            this.summaryFields.briefStatus,
            hasBrief ? this.dataset.briefReadyLabel : this.dataset.briefMissingLabel
          );
        }
      }

      clearCustomValidity() {
        this.querySelectorAll('[data-personalization-input]').forEach((input) => input.setCustomValidity(''));
      }

      getVisibleRequiredInputs() {
        return Array.from(this.querySelectorAll('[data-personalization-input]')).filter(
          (input) => !input.disabled && input.required
        );
      }

      getRequiredMessage(input) {
        if (input.type === 'file') return this.dataset.requiredFileMessage;
        if (input.hasAttribute('data-brief-input')) return this.dataset.requiredBriefMessage;
        return 'Ce champ est requis.';
      }

      hasValue(input) {
        if (!input) return false;
        if (input.type === 'file') return Boolean(input.files && input.files.length);
        return Boolean(input.value && input.value.trim());
      }

      isRoleActiveForMode(role, mode) {
        if (!mode) return false;
        if (role === 'file') return mode === 'voice' || mode === 'voice_music';
        if (role === 'brief') return mode === 'ai' || mode === 'voice_music';
        if (role === 'notes') return mode === 'voice' || mode === 'ai' || mode === 'voice_music';
        return false;
      }

      resolveMode(audioType) {
        const normalizedValue = this.normalizeValue(audioType);

        if (!normalizedValue) return '';
        if (normalizedValue === this.normalizeValue(this.dataset.voiceValue)) return 'voice';
        if (normalizedValue === this.normalizeValue(this.dataset.aiValue)) return 'ai';
        if (normalizedValue === this.normalizeValue(this.dataset.voiceMusicValue)) return 'voice_music';

        if (normalizedValue.includes('voix') && normalizedValue.includes('musique')) return 'voice_music';
        if (normalizedValue.includes('chanson') || normalizedValue.includes('ia')) return 'ai';
        if (normalizedValue.includes('voix') || normalizedValue.includes('message')) return 'voice';

        return '';
      }

      normalizeValue(value) {
        return (value || '')
          .toString()
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
      }

      setText(element, value) {
        if (!element) return;
        element.textContent = value;
      }

      showError(message) {
        if (!this.errorBox) return;
        this.errorBox.textContent = message;
        this.errorBox.hidden = false;
      }

      hideError() {
        if (!this.errorBox) return;
        this.errorBox.textContent = '';
        this.errorBox.hidden = true;
      }
    }
  );
}
