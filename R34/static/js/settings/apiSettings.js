/**
 * API Settings Handler
 */

import { setRangeGradient } from '../utils.js';

export class ApiSettingsManager {
    constructor() {
        this.limitInput = document.getElementById('settingsApiLimitInput');
        this.limitManual = document.getElementById('settingsApiLimitManual');
        this.limitValue = document.getElementById('settingsApiLimitValue');

        this.timeoutInput = document.getElementById('settingsApiTimeoutInput');
        this.timeoutManual = document.getElementById('settingsApiTimeoutManual');
        this.timeoutValue = document.getElementById('settingsApiTimeoutValue');

        this.retriesInput = document.getElementById('settingsApiRetriesInput');
        this.retriesManual = document.getElementById('settingsApiRetriesManual');
        this.retriesValue = document.getElementById('settingsApiRetriesValue');

        this.retryDelayInput = document.getElementById('settingsApiRetryDelayInput');
        this.retryDelayManual = document.getElementById('settingsApiRetryDelayManual');
        this.retryDelayValue = document.getElementById('settingsApiRetryDelayValue');
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // API Limit
        if (this.limitInput && this.limitValue) {
            this.limitInput.addEventListener('input', () => {
                const val = this.limitInput.value;
                this.limitValue.textContent = val;
                if (this.limitManual) this.limitManual.value = val;
                localStorage.setItem('r34_api_limit', val);
                setRangeGradient(this.limitInput);
            });
        }

        if (this.limitManual) {
            this.limitManual.addEventListener('input', () => {
                let val = parseInt(this.limitManual.value, 10);
                if (isNaN(val)) val = 40;
                if (val < 1) val = 1;
                if (val > 100) val = 100;

                if (this.limitInput) {
                    this.limitInput.value = val;
                    setRangeGradient(this.limitInput);
                }
                if (this.limitValue) {
                    this.limitValue.textContent = val;
                }
                localStorage.setItem('r34_api_limit', val);
            });
        }

        // API Timeout
        if (this.timeoutInput && this.timeoutValue) {
            this.timeoutInput.addEventListener('input', () => {
                const val = this.timeoutInput.value;
                this.timeoutValue.textContent = val + 'с';
                if (this.timeoutManual) this.timeoutManual.value = val;
                localStorage.setItem('r34_api_timeout', val);
                setRangeGradient(this.timeoutInput);
            });
        }

        if (this.timeoutManual) {
            this.timeoutManual.addEventListener('input', () => {
                let val = parseInt(this.timeoutManual.value, 10);
                if (isNaN(val)) val = 15;
                if (val < 5) val = 5;
                if (val > 60) val = 60;

                if (this.timeoutInput) {
                    this.timeoutInput.value = val;
                    setRangeGradient(this.timeoutInput);
                }
                if (this.timeoutValue) {
                    this.timeoutValue.textContent = val + 'с';
                }
                localStorage.setItem('r34_api_timeout', val);
            });
        }

        // API Retries
        if (this.retriesInput && this.retriesValue) {
            this.retriesInput.addEventListener('input', () => {
                const val = this.retriesInput.value;
                this.retriesValue.textContent = val;
                if (this.retriesManual) this.retriesManual.value = val;
                localStorage.setItem('r34_api_retries', val);
                setRangeGradient(this.retriesInput);
            });
        }

        if (this.retriesManual) {
            this.retriesManual.addEventListener('input', () => {
                let val = parseInt(this.retriesManual.value, 10);
                if (isNaN(val)) val = 3;
                if (val < 0) val = 0;
                if (val > 10) val = 10;

                if (this.retriesInput) {
                    this.retriesInput.value = val;
                    setRangeGradient(this.retriesInput);
                }
                if (this.retriesValue) {
                    this.retriesValue.textContent = val;
                }
                localStorage.setItem('r34_api_retries', val);
            });
        }

        // API Retry Delay
        if (this.retryDelayInput && this.retryDelayValue) {
            this.retryDelayInput.addEventListener('input', () => {
                const val = this.retryDelayInput.value;
                this.retryDelayValue.textContent = val + 'с';
                if (this.retryDelayManual) this.retryDelayManual.value = val;
                localStorage.setItem('r34_api_retry_delay', val);
                setRangeGradient(this.retryDelayInput);
            });
        }

        if (this.retryDelayManual) {
            this.retryDelayManual.addEventListener('input', () => {
                let val = parseInt(this.retryDelayManual.value, 10);
                if (isNaN(val)) val = 2;
                if (val < 1) val = 1;
                if (val > 30) val = 30;

                if (this.retryDelayInput) {
                    this.retryDelayInput.value = val;
                    setRangeGradient(this.retryDelayInput);
                }
                if (this.retryDelayValue) {
                    this.retryDelayValue.textContent = val + 'с';
                }
                localStorage.setItem('r34_api_retry_delay', val);
            });
        }
    }
}
