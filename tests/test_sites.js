// Simulated dropdown DOM structures from 20+ real Indian govt sites
// Each entry: { site, html, label, selectValue, expectedDisplayAfter }
// html = the dropdown component's outerHTML
// selectValue = text of option user would click
// expectedDisplayAfter = what getDisplayText() should return after selection

const SITES = [
  {
    site: 'SSC ssc.gov.in (ng-dropdown)',
    html: `<div class="ng-dropdown">
      <div class="label">Gender *</div>
      <div class="value-area">--Select--</div>
      <div class="drop-list active"><ul><li>Male</li><li>Female</li></ul></div>
    </div>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.value-area',
  },
  {
    site: 'BPSC onlinebpsc.bihar.gov.in (select2)',
    html: `<div class="select2-container">
      <span class="select2-selection">
        <span class="select2-selection__rendered">Select Gender</span>
      </span>
    </div>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.select2-selection',
  },
  {
    site: 'BSF rectt.bsf.gov.in (React custom)',
    html: `<div class="dropdown-container">
      <div class="dropdown-header">Select Gender</div>
      <div class="dropdown-list"><div class="dropdown-item">Male</div><div class="dropdown-item">Female</div></div>
    </div>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.dropdown-header',
  },
  {
    site: 'UPSC upsconline.nic.in (Angular mat-select)',
    html: `<mat-select role="combobox" aria-label="Gender">
      <div class="mat-select-trigger">
        <div class="mat-select-value"><span class="mat-select-placeholder">Select</span></div>
      </div>
    </mat-select>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.mat-select-trigger',
  },
  {
    site: 'Rajasthan recruitment.rajasthan.gov.in (ng-select)',
    html: `<ng-select class="ng-select">
      <div class="ng-select-container">
        <div class="ng-value-container">
          <div class="ng-placeholder">Select Category</div>
        </div>
      </div>
    </ng-select>`,
    label: 'Category',
    selectValue: 'General',
    expectedDisplayAfter: 'General',
    triggerSel: '.ng-select-container',
  },
  {
    site: 'UPPSC uppsc.up.nic.in (Bootstrap select)',
    html: `<div class="bootstrap-select">
      <button class="btn dropdown-toggle" type="button">
        <span class="filter-option-inner-inner">Select State</span>
      </button>
    </div>`,
    label: 'State',
    selectValue: 'Bihar',
    expectedDisplayAfter: 'Bihar',
    triggerSel: '.btn.dropdown-toggle',
  },
  {
    site: 'NTA otr.nta.ac.in (custom div dropdown)',
    html: `<div class="custom-select-wrapper">
      <div class="custom-select">
        <div class="custom-select__trigger"><span>Select Gender</span></div>
        <div class="custom-options"><span class="custom-option">Male</span><span class="custom-option">Female</span></div>
      </div>
    </div>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.custom-select__trigger',
  },
  {
    site: 'IBPS ibps.in (jQuery chosen)',
    html: `<div class="chosen-container">
      <a class="chosen-single"><span>Select Category</span></a>
      <div class="chosen-drop"><ul class="chosen-results"><li>General</li><li>OBC</li></ul></div>
    </div>`,
    label: 'Category',
    selectValue: 'OBC',
    expectedDisplayAfter: 'OBC',
    triggerSel: '.chosen-single',
  },
  {
    site: 'RRB rrbapply.gov.in (Angular ng-dropdown)',
    html: `<div class="ng-dropdown">
      <span class="label">District</span>
      <span class="select-type">--Select--</span>
    </div>`,
    label: 'District',
    selectValue: 'Gaya',
    expectedDisplayAfter: 'Gaya',
    triggerSel: '.select-type',
  },
  {
    site: 'DSSSB dsssb.delhi.gov.in (select2 v4)',
    html: `<span class="select2 select2-container">
      <span class="selection">
        <span class="select2-selection--single">
          <span class="select2-selection__rendered" title="Select">Select</span>
        </span>
      </span>
    </span>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.select2-selection--single',
  },
  {
    site: 'HPSC hpsc.gov.in (plain styled div)',
    html: `<div class="form-select-wrapper">
      <div class="selected-value">-- Select --</div>
      <ul class="options-list"><li>Male</li><li>Female</li></ul>
    </div>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.selected-value',
  },
  {
    site: 'MPSC mpsc.gov.in (Angular Material)',
    html: `<mat-form-field>
      <mat-select>
        <div class="mat-select-trigger">
          <div class="mat-select-value">
            <span class="mat-select-placeholder mat-select-min-line">Select Category</span>
          </div>
        </div>
      </mat-select>
    </mat-form-field>`,
    label: 'Category',
    selectValue: 'OBC',
    expectedDisplayAfter: 'OBC',
    triggerSel: '.mat-select-trigger',
  },
  {
    site: 'TNPSC tnpsc.gov.in (custom React)',
    html: `<div class="react-select__control">
      <div class="react-select__value-container">
        <div class="react-select__placeholder">Select Religion</div>
      </div>
    </div>`,
    label: 'Religion',
    selectValue: 'Hindu',
    expectedDisplayAfter: 'Hindu',
    triggerSel: '.react-select__control',
  },
  {
    site: 'KPSC kpsc.kar.nic.in (old jQuery UI)',
    html: `<div class="ui-selectmenu-button">
      <span class="ui-selectmenu-text">Select District</span>
    </div>`,
    label: 'District',
    selectValue: 'Gaya',
    expectedDisplayAfter: 'Gaya',
    triggerSel: '.ui-selectmenu-button',
  },
  {
    site: 'WBPSC wbpsc.gov.in (Bootstrap 4 dropdown)',
    html: `<div class="dropdown">
      <button class="btn btn-secondary dropdown-toggle" type="button">Select State</button>
      <div class="dropdown-menu"><a class="dropdown-item">Bihar</a></div>
    </div>`,
    label: 'State',
    selectValue: 'Bihar',
    expectedDisplayAfter: 'Bihar',
    triggerSel: '.dropdown-toggle',
  },
  {
    site: 'RPSC rpsc.rajasthan.gov.in (Vuetify v-select)',
    html: `<div class="v-select__slot">
      <div class="v-select__selections">
        <div class="v-select__selection v-select__selection--comma"></div>
      </div>
      <div class="v-input__append-inner"><div class="v-input__icon v-input__icon--append"></div></div>
    </div>`,
    label: 'Category',
    selectValue: 'General',
    expectedDisplayAfter: 'General',
    triggerSel: '.v-select__slot',
  },
  {
    site: 'CGPSC psc.cg.gov.in (Materialize CSS)',
    html: `<div class="select-wrapper">
      <input class="select-dropdown dropdown-trigger" type="text" value="Select Gender" readonly>
      <ul class="dropdown-content select-dropdown"><li><span>Male</span></li><li><span>Female</span></li></ul>
    </div>`,
    label: 'Gender',
    selectValue: 'Female',
    expectedDisplayAfter: 'Female',
    triggerSel: '.select-dropdown',
  },
  {
    site: 'JPSC jpsc.gov.in (simple span-based)',
    html: `<div class="jpsc-select">
      <span class="jpsc-selected">Select Category</span>
      <div class="jpsc-options"><span>General</span><span>OBC</span><span>SC</span></div>
    </div>`,
    label: 'Category',
    selectValue: 'SC',
    expectedDisplayAfter: 'SC',
    triggerSel: '.jpsc-selected',
  },
  {
    site: 'OPSC opsc.gov.in (Angular CDK overlay)',
    html: `<div class="opsc-dropdown">
      <div class="opsc-trigger">
        <span class="opsc-value">Select Nationality</span>
        <span class="opsc-arrow">▼</span>
      </div>
    </div>`,
    label: 'Nationality',
    selectValue: 'Indian',
    expectedDisplayAfter: 'Indian',
    triggerSel: '.opsc-trigger',
  },
  {
    site: 'APPSC psc.ap.gov.in (PrimeNG dropdown)',
    html: `<div class="p-dropdown p-component">
      <span class="p-dropdown-label p-placeholder">Select State</span>
      <div class="p-dropdown-trigger"><span class="p-dropdown-trigger-icon"></span></div>
    </div>`,
    label: 'State',
    selectValue: 'Bihar',
    expectedDisplayAfter: 'Bihar',
    triggerSel: '.p-dropdown-label',
  },
];

module.exports = SITES;

// Add UPESSC from screenshot
SITES.push({
  site: 'UPESSC bed.upessc.org (Angular custom dropdown)',
  html: `<div class="ng-select-container">
    <div class="ng-value-container">
      <div class="ng-placeholder">Select Identity Proof</div>
    </div>
    <div class="ng-arrow-wrapper"><span class="ng-arrow"></span></div>
  </div>`,
  label: 'Step 2a: Select Identity Proof',
  selectValue: 'Aadhaar Card',
  expectedDisplayAfter: 'Aadhaar Card',
  triggerSel: '.ng-select-container',
});

SITES.push({
  site: 'UPESSC bed.upessc.org (DAY select)',
  html: `<select id="day" name="day"><option value="">DAY</option><option value="14">14</option></select>`,
  label: 'DAY',
  selectValue: '14',
  expectedDisplayAfter: '14',
  triggerSel: 'select',
  isNativeSelect: true,
});

SITES.push({
  site: 'UPESSC bed.upessc.org (MONTH select)',
  html: `<select id="month" name="month"><option value="">MONTH</option><option value="January">January</option></select>`,
  label: 'MONTH',
  selectValue: 'January',
  expectedDisplayAfter: 'January',
  triggerSel: 'select',
  isNativeSelect: true,
});
