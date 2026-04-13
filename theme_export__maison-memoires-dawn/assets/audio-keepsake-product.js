if (!customElements.get('audio-keepsake-form')) {
  customElements.define(
    'audio-keepsake-form',
    class AudioKeepsakeForm extends HTMLElement {
      constructor() {
        super();
        this.handleChange = this.handleChange.bind(this);
        this.handleProxySubmit = this.handleProxySubmit.bind(this);
      }

      connectedCallback() {
        this.productInfo = this.closest('product-info');
        if (!this.productInfo) return;

        this.summaryFields = {
          audioType: this.querySelector('[data-summary-field="audio_type"]'),
          duration: this.querySelector('[data-summary-field="duration"]'),
          packaging: this.querySelector('[data-summary-field="packaging"]'),
          nextStep: this.querySelector('[data-summary-field="next_step"]'),
        };

        this.proxyButtons = Array.from(this.querySelectorAll('[data-audio-proxy-submit]'));
        this.proxyButtons.forEach((button) => button.addEventListener('click', this.handleProxySubmit));

        this.productInfo.addEventListener('change', this.handleChange);
        this.syncFromState();
      }

      disconnectedCallback() {
        this.productInfo?.removeEventListener('change', this.handleChange);
        this.proxyButtons?.forEach((button) => button.removeEventListener('click', this.handleProxySubmit));
      }

      handleChange() {
        window.requestAnimationFrame(() => this.syncFromState());
      }

      handleProxySubmit(event) {
        event.preventDefault();

        const submitButton = this.getSubmitButton(event.currentTarget?.dataset.audioSubmitTarget);
        if (!submitButton || submitButton.disabled || submitButton.getAttribute('aria-disabled') === 'true') {
          return;
        }

        submitButton.click();
      }

      syncFromState() {
        const state = this.getCurrentState();
        this.updateGroups(state.mode);
        this.updateSummary(state);
        this.syncProxyButtons();
      }

      getCurrentState() {
        const options = this.getVariantOptions();
        const audioOptionName = this.normalizeValue(this.dataset.audioOptionName);
        const durationOptionName = this.normalizeValue(this.dataset.durationOptionName);
        const packagingOptionName = this.normalizeValue(this.dataset.packagingOptionName);

        const audioTypeOption = options.find((option) => this.normalizeValue(option.name) === audioOptionName);
        const durationOption = options.find((option) => this.normalizeValue(option.name) === durationOptionName);
        const packagingOption = options.find((option) => this.normalizeValue(option.name) === packagingOptionName);
        const fallbackOptions = options.filter(
          (option) =>
            this.normalizeValue(option.name) !== audioOptionName &&
            this.normalizeValue(option.name) !== durationOptionName &&
            this.normalizeValue(option.name) !== packagingOptionName
        );

        const audioType = audioTypeOption?.value || '';
        const duration = durationOption?.value || fallbackOptions[0]?.value || '';
        const packaging = packagingOption?.value || fallbackOptions[1]?.value || '';

        return {
          audioType,
          duration,
          packaging,
          mode: this.resolveMode(audioType),
        };
      }

      getVariantOptions() {
        const variantSelects = this.productInfo?.querySelector('variant-selects');
        if (!variantSelects) return [];

        return Array.from(variantSelects.children)
          .filter((element) => element.matches('fieldset, .product-form__input--dropdown'))
          .map((element) => {
            if (element.tagName === 'FIELDSET') {
              const checkedInput = element.querySelector('input:checked');
              return {
                name: this.getFieldsetName(element, checkedInput),
                value: checkedInput?.value || '',
              };
            }

            const select = element.querySelector('select');
            return {
              name: this.getSelectName(select),
              value: select?.value || '',
            };
          });
      }

      getFieldsetName(fieldset, checkedInput) {
        const legend = fieldset.querySelector('legend');
        const legendLabel = legend?.childNodes?.[0]?.textContent?.trim();
        if (legendLabel) return legendLabel.replace(/:$/, '').trim();

        return (checkedInput?.name || '').replace(/-\d+$/, '').trim();
      }

      getSelectName(select) {
        const match = (select?.name || '').match(/^options\[(.*)\]$/);
        return match ? match[1] : '';
      }

      updateGroups(mode) {
        this.querySelectorAll('[data-audio-role]').forEach((group) => {
          group.hidden = !this.isRoleActiveForMode(group.dataset.audioRole, mode);
        });
      }

      updateSummary(state) {
        this.setText(this.summaryFields.audioType, state.audioType || this.dataset.defaultChoiceLabel);
        this.setText(this.summaryFields.duration, state.duration || this.dataset.defaultChoiceLabel);
        this.setText(this.summaryFields.packaging, state.packaging || this.dataset.defaultChoiceLabel);
        this.setText(this.summaryFields.nextStep, this.getNextStepText(state.mode));
      }

      syncProxyButtons() {
        const submitButton = this.getSubmitButton();
        if (!submitButton) return;

        const submitLabel = submitButton.querySelector('span')?.textContent?.trim() || submitButton.textContent.trim();
        const isDisabled = submitButton.disabled || submitButton.getAttribute('aria-disabled') === 'true';

        this.proxyButtons.forEach((button) => {
          button.textContent = submitLabel;
          button.disabled = isDisabled;
        });
      }

      getSubmitButton(targetId) {
        if (targetId) {
          return this.querySelector(`#${targetId}`) || document.getElementById(targetId);
        }

        return this.querySelector('button[type="submit"]');
      }

      getNextStepText(mode) {
        if (mode === 'voice') return this.dataset.nextStepVoice || this.dataset.nextStepDefault;
        if (mode === 'ai') return this.dataset.nextStepAi || this.dataset.nextStepDefault;
        if (mode === 'voice_music') return this.dataset.nextStepVoiceMusic || this.dataset.nextStepDefault;
        return this.dataset.nextStepDefault || '';
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
        if (
          normalizedValue.includes('musique composee') ||
          normalizedValue.includes('chanson') ||
          normalizedValue.includes('ia')
        ) {
          return 'ai';
        }
        if (
          normalizedValue.includes('enregistrement') ||
          normalizedValue.includes('voix') ||
          normalizedValue.includes('message')
        ) {
          return 'voice';
        }

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
        if (element) element.textContent = value;
      }
    }
  );
}
