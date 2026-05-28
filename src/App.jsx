import React, {useRef, useState} from 'react';
import {useForm} from 'react-hook-form';
import html2canvas from 'html2canvas';
import {jsPDF} from 'jspdf';

// Number to Words converter (Indian System)
function numberToWords(num) {
  if (num === 0) return 'Zero';

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  const convertLessThanOneThousand = (n) => {
    if (n === 0) return '';
    let result = '';
    if (n >= 100) {
      result += a[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n > 0) {
      if (n < 20) {
        result += a[n] + ' ';
      } else {
        result += b[Math.floor(n / 10)] + ' ';
        if (n % 10 > 0) {
          result += a[n % 10] + ' ';
        }
      }
    }
    return result;
  };

  let result = '';
  if (num >= 10000000) {
    result += convertLessThanOneThousand(Math.floor(num / 10000000)) + 'Crore ';
    num %= 10000000;
  }
  if (num >= 100000) {
    result += convertLessThanOneThousand(Math.floor(num / 100000)) + 'Lakh ';
    num %= 100000;
  }
  if (num >= 1000) {
    result += convertLessThanOneThousand(Math.floor(num / 1000)) + 'Thousand ';
    num %= 1000;
  }
  if (num > 0) {
    result += convertLessThanOneThousand(num);
  }

  return result.trim() + ' Only';
}

/**
 * html2canvas cannot parse modern color functions (e.g. oklch). Browsers may still
 * serialize getComputedStyle() as oklch; coerce via a temporary element so values
 * become rgb/rgba (or use @theme hex in index.css).
 */
function coerceCssValueForHtml2Canvas(propertyName, value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/\b(oklch|lab\(|color-mix\()/i.test(trimmed)) {
    return value;
  }
  try {
    const el = document.createElement('div');
    el.style.setProperty(propertyName, trimmed);
    document.body.appendChild(el);
    const resolved = window
      .getComputedStyle(el)
      .getPropertyValue(propertyName)
      .trim();
    el.remove();
    if (resolved && !/\b(oklch|lab\(|color-mix\()/i.test(resolved)) {
      return resolved;
    }
  } catch {
    // fall through
  }
  if (/color$/i.test(propertyName) || /^(fill|stroke)$/i.test(propertyName)) {
    return 'rgb(0, 0, 0)';
  }
  if (/shadow$/i.test(propertyName)) {
    return 'none';
  }
  return 'transparent';
}

/**
 * html2canvas cannot parse modern color functions (e.g. oklch) used by Tailwind v4.
 * Copy resolved computed styles from the live DOM onto the iframe clone, then drop
 * stylesheets so the renderer never sees oklch in CSS text.
 */
function stripClonedDocumentStyles(clonedDoc) {
  clonedDoc
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => node.remove());
}

function inlineComputedStylesFromSource(sourceRoot, cloneRoot) {
  const walk = (source, clone) => {
    if (
      source?.nodeType !== Node.ELEMENT_NODE ||
      clone?.nodeType !== Node.ELEMENT_NODE
    ) {
      return;
    }
    const computed = window.getComputedStyle(source);
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      const raw = computed.getPropertyValue(prop);
      clone.style.setProperty(
        prop,
        coerceCssValueForHtml2Canvas(prop, raw),
        computed.getPropertyPriority(prop),
      );
    }
    const srcKids = source.children;
    const cloneKids = clone.children;
    for (let j = 0; j < srcKids.length; j++) {
      if (cloneKids[j]) {
        walk(srcKids[j], cloneKids[j]);
      }
    }
  };
  walk(sourceRoot, cloneRoot);
}

/** Split a tall canvas image across A4 pages (jsPDF requires each page slice to fit). */
function addImagePages(
  pdf,
  imgData,
  imgWidthMm,
  imgHeightMm,
  imageFormat = 'PNG',
) {
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  let heightLeftMm = imgHeightMm;
  let positionMm = 0;

  pdf.addImage(imgData, imageFormat, 0, positionMm, imgWidthMm, imgHeightMm);
  heightLeftMm -= pageHeightMm;

  while (heightLeftMm > 0) {
    positionMm = heightLeftMm - imgHeightMm;
    pdf.addPage();
    pdf.addImage(imgData, imageFormat, 0, positionMm, imgWidthMm, imgHeightMm);
    heightLeftMm -= pageHeightMm;
  }
}

function App() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoError, setLogoError] = useState('');
  const [pdfError, setPdfError] = useState('');

  const {
    register,
    watch,
    handleSubmit,
    formState: {errors},
  } = useForm({
    defaultValues: {
      // Company & Header
      companyName: 'Kasantra Technologies',
      companyDescription: 'A unit of Kasantra Technologies Software Solutions',
      payslipMonth: 'April 2026',
      logoWidth: 160,
      logoHeight: 160,
      maxLogoSizeMB: 2,

      // Employee
      name: 'Rajesh G',
      employeeNo: '103725',
      joiningDate: '21 Mar 2024',
      designation: 'Manager - IT',
      department: 'Information Technology',
      location: 'Chennai',
      bankName: 'HDFC',
      bankAccountNo: '50100055750875',
      panNumber: 'BKFPB657767',
      printDate: 'May 2, 2026 5:43 AM',
      effectiveWorkDays: '30',
      lop: 0,
      lopReversal: 0,

      t_basic: 7500,
      t_hra: 3750,
      t_otherAllowance: 3750,

      // Earnings & Deductions
      basic: 0,
      hra: 0,
      otherAllowance: 0,
      profTax: 0,
      gmcDeduction: 0,
    },
  });

  const formData = watch();
  const printRef = useRef();

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const maxSizeBytes = (Number(formData.maxLogoSizeMB) || 2) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setLogoError(
        `File size exceeds the limit of ${formData.maxLogoSizeMB} MB.`,
      );
      setLogoUrl(null);
      return;
    }

    setLogoError('');
    const url = URL.createObjectURL(file);
    setLogoUrl(url);
  };

  const handleGeneratePDF = async () => {
    setPdfError('');
    if (!printRef.current) {
      setPdfError('Preview is not ready. Refresh the page and try again.');
      return;
    }

    const element = printRef.current;
    const scrollSnapshots = [];
    let node = element.parentElement;
    while (node) {
      if (node.scrollTop || node.scrollLeft) {
        scrollSnapshots.push({
          el: node,
          top: node.scrollTop,
          left: node.scrollLeft,
        });
        node.scrollTop = 0;
        node.scrollLeft = 0;
      }
      node = node.parentElement;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc, clonedElement) => {
          inlineComputedStylesFromSource(element, clonedElement);
          stripClonedDocumentStyles(clonedDoc);
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeightMm = (canvas.height * pdfWidth) / canvas.width;

      addImagePages(pdf, imgData, pdfWidth, imgHeightMm, 'PNG');

      const safeName = String(formData.name || 'Employee').replace(
        /[/\\?%*:|"<>]/g,
        '_',
      );
      pdf.save(`Payslip_${safeName}.pdf`);
    } catch (error) {
      console.error('Error generating PDF', error);
      setPdfError(
        error instanceof Error
          ? error.message
          : 'Could not create PDF. Check the browser console for details.',
      );
    } finally {
      scrollSnapshots.forEach(({el, top, left}) => {
        el.scrollTop = top;
        el.scrollLeft = left;
      });
    }
  };

  // Calculations
  const parseNum = (val) => Number(val) || 0;

  const totalEarnings =
    parseNum(formData.basic) +
    parseNum(formData.hra) +
    parseNum(formData.otherAllowance);

  const totalStandrad =
    parseNum(formData.t_basic) +
    parseNum(formData.t_hra) +
    parseNum(formData.t_otherAllowance);

  const totalDeductions =
    parseNum(formData.profTax) + parseNum(formData.gmcDeduction);
  const netPay = totalEarnings - totalDeductions;

  const netPayWords = numberToWords(netPay);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* FORM SECTION */}
        <div className="xl:col-span-4 bg-white p-6 rounded-xl shadow-lg h-fit max-h-[90vh] overflow-y-auto">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">
            Payslip Settings
          </h2>
          <form className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg text-blue-600">
                Company & Header Settings
              </h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Company Title
                  </label>
                  <input
                    {...register('companyName', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Company Description
                  </label>
                  <input
                    {...register('companyDescription')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Payslip Month Label
                  </label>
                  <input
                    {...register('payslipMonth', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">
                Logo Customization
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Width (px)
                  </label>
                  <input
                    type="number"
                    {...register('logoWidth')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Height (px)
                  </label>
                  <input
                    type="number"
                    {...register('logoHeight')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Max Size (MB)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...register('maxLogoSizeMB')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Upload Logo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {logoError && (
                    <p className="text-red-500 text-xs mt-1">{logoError}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">
                Employee Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    {...register('name', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Employee No
                  </label>
                  <input
                    {...register('employeeNo', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Joining Date
                  </label>
                  <input
                    {...register('joiningDate', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Designation
                  </label>
                  <input
                    {...register('designation', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Department
                  </label>
                  <input
                    {...register('department', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Location
                  </label>
                  <input
                    {...register('location', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Print Date
                  </label>
                  <input
                    {...register('printDate', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">
                Bank Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Bank Name
                  </label>
                  <input
                    {...register('bankName', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Bank Account No
                  </label>
                  <input
                    {...register('bankAccountNo', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    PAN Number
                  </label>
                  <input
                    {...register('panNumber', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">
                Attendance
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Work Days
                  </label>
                  <input
                    type="number"
                    {...register('effectiveWorkDays', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    LOP
                  </label>
                  <input
                    type="number"
                    {...register('lop')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    LOP Reversal
                  </label>
                  <input
                    type="number"
                    {...register('lopReversal')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">Standard</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Basic
                  </label>
                  <input
                    type="number"
                    {...register('t_basic', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    HRA
                  </label>
                  <input
                    type="number"
                    {...register('t_hra', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Other Allow.
                  </label>
                  <input
                    type="number"
                    {...register('t_otherAllowance', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">Earnings</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Basic
                  </label>
                  <input
                    type="number"
                    {...register('basic', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    HRA
                  </label>
                  <input
                    type="number"
                    {...register('hra', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Other Allow.
                  </label>
                  <input
                    type="number"
                    {...register('otherAllowance', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <h3 className="font-semibold text-lg text-blue-600">
                Deductions
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Prof Tax
                  </label>
                  <input
                    type="number"
                    {...register('profTax', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    GMC Ded.
                  </label>
                  <input
                    type="number"
                    {...register('gmcDeduction', {required: true})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={handleGeneratePDF}
                className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded hover:bg-blue-700 transition cursor-pointer">
                Download PDF
              </button>
              {pdfError && (
                <p className="text-red-600 text-sm mt-2" role="alert">
                  {pdfError}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* PREVIEW SECTION */}
        <div className="xl:col-span-8 overflow-auto flex justify-center bg-gray-200 p-8 rounded-xl relative">
          <div
            ref={printRef}
            className="bg-white w-[210mm] min-h-[297mm] shadow-2xl relative"
            style={{padding: '40px', boxSizing: 'border-box'}}>
            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
              <div
                className="flex items-center justify-center border-gray-400 text-gray-400 font-bold overflow-hidden"
                style={{
                  width: `${formData.logoWidth}px`,
                  height: `${formData.logoHeight}px`,
                  borderWidth: logoUrl ? '0px' : '1px',
                  borderStyle: 'dashed',
                }}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Company Logo"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  '[LOGO]'
                )}
              </div>
              <div
                className="text-center flex-1"
                style={{paddingRight: `${formData.logoWidth}px`}}>
                <h1 className="text-xl font-bold font-serif">
                  {formData.companyName}
                </h1>
                <p className="text-sm">{formData.companyDescription}</p>
                <h2 className="text-lg font-bold mt-2">
                  Payslip for the month of {formData.payslipMonth}
                </h2>
              </div>
            </div>

            {/* Employee Details Grid */}
            <div className="grid grid-cols-2 border border-black mb-6 text-sm">
              <div className="border-r border-black p-2">
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Name:</span>
                  <span className="font-medium">{formData.name}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Joining Date:</span>
                  <span className="font-medium">{formData.joiningDate}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Designation:</span>
                  <span className="font-medium">{formData.designation}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Department:</span>
                  <span className="font-medium">{formData.department}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Location:</span>
                  <span className="font-medium">{formData.location}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Effective Work Days:</span>
                  <span className="font-medium">
                    {formData.effectiveWorkDays}
                  </span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">LOP:</span>
                  <span className="font-medium">{formData.lop}</span>
                </div>
                <div className="grid grid-cols-2">
                  <span className="text-gray-700">LOP REVERSAL:</span>
                  <span className="font-medium">{formData.lopReversal}</span>
                </div>
              </div>
              <div className="p-2">
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Employee No:</span>
                  <span className="font-medium">{formData.employeeNo}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Bank Name:</span>
                  <span className="font-medium">{formData.bankName}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">Bank Account No:</span>
                  <span className="font-medium">{formData.bankAccountNo}</span>
                </div>
                <div className="grid grid-cols-2 mb-1">
                  <span className="text-gray-700">PAN Number:</span>
                  <span className="font-medium">{formData.panNumber}</span>
                </div>
              </div>
            </div>

            {/* Earnings & Deductions Table */}
            <div className="border border-black mb-4 text-sm">
              <div className="grid grid-cols-2 border-b border-black bg-[#f2f2f2] font-bold text-center">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 p-2 border-r border-black">
                  <span className="text-left">Earnings</span>
                  <span className="w-16">Standard</span>
                  <span className="w-16">Actual</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 p-2">
                  <span className="text-left">Deductions</span>
                  <span className="w-16 text-right">Actual</span>
                </div>
              </div>

              {/* Row 1 */}
              <div className="grid grid-cols-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-2 py-1 border-r border-black">
                  <span>BASIC</span>
                  <span className="w-16 text-right">{formData.t_basic}</span>
                  <span className="w-16 text-right">{formData.basic}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-2 py-1">
                  <span>PROF TAX</span>
                  <span className="w-16 text-right">{formData.profTax}</span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-2 py-1 border-r border-black">
                  <span>HRA</span>
                  <span className="w-16 text-right">{formData.t_hra}</span>
                  <span className="w-16 text-right">{formData.hra}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-2 py-1">
                  <span>GMC DEDUCTION</span>
                  <span className="w-16 text-right">
                    {formData.gmcDeduction}
                  </span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-2">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-2 py-1 border-r border-black">
                  <span>OTHER ALLOWANCE</span>
                  <span className="w-16 text-right">
                    {formData.t_otherAllowance}
                  </span>
                  <span className="w-16 text-right">
                    {formData.otherAllowance}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 px-2 py-1">
                  <span></span>
                  <span className="w-16 text-right"></span>
                </div>
              </div>

              {/* Fill empty space */}
              <div className="grid grid-cols-2 min-h-[40px]">
                <div className="border-r border-black"></div>
                <div></div>
              </div>

              {/* Totals Row */}
              <div className="grid grid-cols-2 border-t border-black bg-white">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 p-2 border-r border-black">
                  <span className="font-bold">Total Earnings:INR.</span>
                  <span className="w-16 text-right font-medium">
                    {totalStandrad}
                  </span>
                  <span className="w-16 text-right font-medium">
                    {totalEarnings}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-4 p-2">
                  <span className="font-bold">Total Deductions:INR.</span>
                  <span className="w-16 text-right font-medium">
                    {totalDeductions}
                  </span>
                </div>
              </div>
            </div>

            {/* Net Pay */}
            <div className="border border-black p-2 text-sm">
              <div className="flex gap-2">
                <span>
                  Net Pay for the month ( Total Earnings - Total Deductions):
                </span>
                <span className="font-bold">{netPay}</span>
              </div>
              <div className="italic mt-2 text-gray-700">
                (Rupees {netPayWords})
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 text-center text-xs text-gray-600">
              This is a system generated payslip and does not require signature.
            </div>

            {/* Print Date at very bottom left */}
            <div className="absolute bottom-10 left-10 text-xs text-gray-600">
              Print Date: {formData.printDate}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
