import type { FormDefinition } from "@admiral/form-platform";

export type ContainerItem = { id: string; type: string; quantity: number; weight: number };
export type ContactItem = { id: string; name: string; phone: string; relation: string };

export type BookingValue = {
  customer: string;
  bookingReference: string;
  portOfLoading: string;
  portOfDischarge: string;
  voyage: string;
  cargoType: string;
  unNumber?: string;
  targetTemperature?: number;
  containers: ContainerItem[];
  baseCharge: number;
  surcharge: number;
  tax: number;
  discount: number;
  totalCharge: number;
  attachments: unknown[];
};

export type EmployeeValue = {
  fullName: string;
  nationalId: string;
  employmentType: string;
  department: string;
  position: string;
  manager: string;
  startDate: string;
  salary: number;
  bankAccount: string;
  equipment: string[];
  emergencyContacts: ContactItem[];
  attachments: unknown[];
};

const portOptions = [
  { value: "CNSHA", label: { en: "Shanghai", fa: "شانگهای" } },
  { value: "IRBND", label: { en: "Bandar Abbas", fa: "بندر عباس" } },
  { value: "NLRTM", label: { en: "Rotterdam", fa: "روتردام" } },
  { value: "SGSIN", label: { en: "Singapore", fa: "سنگاپور" } }
];

export const bookingInitialValues: BookingValue = {
  customer: "",
  bookingReference: "",
  portOfLoading: "",
  portOfDischarge: "",
  voyage: "",
  cargoType: "general",
  containers: [],
  baseCharge: 1200,
  surcharge: 120,
  tax: 96,
  discount: 0,
  totalCharge: 1416,
  attachments: []
};

export const shipmentBookingForm: FormDefinition<BookingValue> = {
  id: "shipment-booking",
  version: 2,
  title: { en: "Shipment Booking", fa: "رزرو حمل کانتینری" },
  description: { en: "A multi-step maritime booking workflow powered by typed metadata.", fa: "فرآیند چندمرحله‌ای رزرو حمل دریایی بر پایه متادیتای تایپ‌شده." },
  sections: [
    {
      id: "general",
      title: { en: "General Information", fa: "اطلاعات عمومی" },
      fields: [
        { id: "customer", type: "select", label: { en: "Customer", fa: "مشتری" }, required: true, options: [{ value: "acme", label: { en: "Acme Logistics", fa: "اکمی لجستیک" } }, { value: "adm", label: { en: "Admiral Foods", fa: "ادمیرال فودز" } }] },
        { id: "bookingReference", type: "text", label: { en: "Booking reference", fa: "شماره رزرو" }, required: true, validation: [{ type: "pattern", value: "^BK-[0-9]{4}$", message: { en: "Use format BK-1234.", fa: "از قالب BK-1234 استفاده کنید." } }] }
      ]
    },
    {
      id: "route",
      title: { en: "Route", fa: "مسیر" },
      description: { en: "Dependent voyage options would be provided by a tenant-aware data source in production.", fa: "در محیط واقعی، گزینه‌های سفر با منبع داده وابسته به مستاجر و مسیر تامین می‌شوند." },
      fields: [
        { id: "portOfLoading", type: "select", label: { en: "Port of loading", fa: "بندر بارگیری" }, required: true, options: portOptions },
        { id: "portOfDischarge", type: "select", label: { en: "Port of discharge", fa: "بندر تخلیه" }, required: true, options: portOptions, validation: [{ type: "notEqual", field: "portOfLoading", message: { en: "Port of discharge must differ from loading port.", fa: "بندر تخلیه باید با بندر بارگیری متفاوت باشد." } }] },
        { id: "voyage", type: "select", label: { en: "Voyage", fa: "سفر دریایی" }, required: true, dataSource: { type: "remote", resource: "voyages", dependsOn: ["portOfLoading", "portOfDischarge"] }, options: [{ value: "VOY-881", label: { en: "VOY-881 / July Express", fa: "VOY-881 / اکسپرس جولای" } }, { value: "VOY-914", label: { en: "VOY-914 / Caspian Link", fa: "VOY-914 / لینک کاسپین" } }] }
      ]
    },
    {
      id: "cargo",
      title: { en: "Cargo", fa: "محموله" },
      fields: [
        { id: "cargoType", type: "select", label: { en: "Cargo type", fa: "نوع محموله" }, options: [{ value: "general", label: { en: "General", fa: "عمومی" } }, { value: "dangerous-goods", label: { en: "Dangerous goods", fa: "کالای خطرناک" } }, { value: "refrigerated", label: { en: "Refrigerated", fa: "یخچالی" } }] },
        { id: "unNumber", type: "text", label: { en: "UN number", fa: "شماره UN" }, visibility: { field: "cargoType", operator: "equals", value: "dangerous-goods" }, requiredWhen: { field: "cargoType", operator: "equals", value: "dangerous-goods" } },
        { id: "targetTemperature", type: "number", label: { en: "Target temperature", fa: "دمای هدف" }, visibility: { field: "cargoType", operator: "equals", value: "refrigerated" }, requiredWhen: { field: "cargoType", operator: "equals", value: "refrigerated" } }
      ]
    },
    {
      id: "containers",
      title: { en: "Containers", fa: "کانتینرها" },
      fields: [{ id: "containers", type: "repeating-group", label: { en: "Container list", fa: "فهرست کانتینرها" }, fields: [] }]
    },
    {
      id: "charges",
      title: { en: "Charges", fa: "هزینه‌ها" },
      fields: [
        { id: "baseCharge", type: "currency", label: { en: "Base charge", fa: "هزینه پایه" }, required: true },
        { id: "surcharge", type: "currency", label: { en: "Surcharge", fa: "هزینه اضافی" } },
        { id: "tax", type: "currency", label: { en: "Tax", fa: "مالیات" } },
        { id: "discount", type: "currency", label: { en: "Discount", fa: "تخفیف" }, permission: { edit: "booking.discount.write" } },
        { id: "totalCharge", type: "calculated", label: { en: "Total charge", fa: "جمع کل هزینه" }, calculated: { dependencies: ["baseCharge", "surcharge", "tax", "discount"], precision: 2, calculate: (values) => Number(values.baseCharge ?? 0) + Number(values.surcharge ?? 0) + Number(values.tax ?? 0) - Number(values.discount ?? 0) } }
      ]
    },
    { id: "documents", title: { en: "Documents", fa: "مدارک" }, fields: [{ id: "attachments", type: "file", label: { en: "Attachments", fa: "پیوست‌ها" } }] }
  ],
  steps: [
    { id: "general", title: { en: "General", fa: "عمومی" }, sectionIds: ["general"] },
    { id: "route", title: { en: "Route", fa: "مسیر" }, sectionIds: ["route"] },
    { id: "cargo", title: { en: "Cargo", fa: "محموله" }, sectionIds: ["cargo", "containers"] },
    { id: "charges", title: { en: "Charges", fa: "هزینه‌ها" }, sectionIds: ["charges", "documents"] },
    { id: "review", title: { en: "Review", fa: "بازبینی" }, sectionIds: ["general", "route", "cargo", "containers", "charges", "documents"] }
  ],
  rules: [
    { id: "dg-warning", priority: 10, when: { field: "cargoType", operator: "equals", value: "dangerous-goods" }, effects: [{ type: "warning", target: "unNumber", message: { en: "Dangerous goods require verified documents before submission.", fa: "کالای خطرناک پیش از ارسال به مدارک تاییدشده نیاز دارد." } }] }
  ],
  migrations: {
    1: (oldValue) => ({ ...oldValue, totalCharge: Number(oldValue.baseCharge ?? 0) + Number(oldValue.surcharge ?? 0) + Number(oldValue.tax ?? 0) - Number(oldValue.discount ?? 0) })
  },
  submission: {
    submit: async (values, context, idempotencyKey) => {
      if (values.bookingReference === "BK-4090" && context.reviewedConflictVersion !== 8) return { status: "conflict", currentVersion: 8, latestValues: { ...values, surcharge: values.surcharge + 50 } };
      if (values.bookingReference === "BK-0000") return { status: "unknown", idempotencyKey };
      return { status: "succeeded", entityId: "booking-2048", entityVersion: 3 };
    },
    checkStatus: async (idempotencyKey) => ({ status: "succeeded", entityId: `booking-${idempotencyKey.slice(0, 8)}`, entityVersion: 4 })
  }
};

export const employeeInitialValues: EmployeeValue = {
  fullName: "",
  nationalId: "",
  employmentType: "employee",
  department: "",
  position: "",
  manager: "",
  startDate: "",
  salary: 0,
  bankAccount: "",
  equipment: [],
  emergencyContacts: [],
  attachments: []
};

export const employeeOnboardingForm: FormDefinition<EmployeeValue> = {
  id: "employee-onboarding",
  version: 1,
  title: { en: "Employee Onboarding", fa: "شروع همکاری کارمند" },
  description: { en: "A permission-aware HR workflow with async-style national ID validation.", fa: "فرآیند منابع انسانی با کنترل دسترسی و اعتبارسنجی غیرهمزمان کد ملی." },
  sections: [
    { id: "personal", title: { en: "Personal Information", fa: "اطلاعات فردی" }, fields: [
      { id: "fullName", type: "text", label: { en: "Full name", fa: "نام کامل" }, required: true },
      { id: "nationalId", type: "text", label: { en: "National ID", fa: "کد ملی" }, required: true, validation: [{ type: "async", message: { en: "National ID is already registered.", fa: "این کد ملی قبلا ثبت شده است." }, validate: async (value) => String(value) !== "1111111111" }] }
    ] },
    { id: "employment", title: { en: "Employment Information", fa: "اطلاعات شغلی" }, fields: [
      { id: "employmentType", type: "select", label: { en: "Employment type", fa: "نوع همکاری" }, options: [{ value: "employee", label: { en: "Employee", fa: "کارمند" } }, { value: "contractor", label: { en: "Contractor", fa: "پیمانکار" } }] },
      { id: "department", type: "select", label: { en: "Department", fa: "دپارتمان" }, required: true, options: [{ value: "ops", label: { en: "Operations", fa: "عملیات" } }, { value: "finance", label: { en: "Finance", fa: "مالی" } }, { value: "engineering", label: { en: "Engineering", fa: "مهندسی" } }] },
      { id: "position", type: "text", label: { en: "Position", fa: "سمت" }, required: true },
      { id: "manager", type: "select", label: { en: "Manager", fa: "مدیر مستقیم" }, dataSource: { type: "remote", resource: "managers", dependsOn: ["department"] }, options: [{ value: "m-smith", label: { en: "Mina Smith", fa: "مینا اسمیت" } }, { value: "a-kazemi", label: { en: "Arman Kazemi", fa: "آرمان کاظمی" } }] },
      { id: "startDate", type: "date", label: { en: "Start date", fa: "تاریخ شروع" }, required: true }
    ] },
    { id: "payroll", title: { en: "Payroll", fa: "حقوق و پرداخت" }, fields: [
      { id: "salary", type: "currency", label: { en: "Salary", fa: "حقوق" }, permission: { view: "payroll.salary.read", edit: "payroll.salary.write" } },
      { id: "bankAccount", type: "text", label: { en: "Bank account", fa: "شماره حساب بانکی" }, requiredWhen: { field: "employmentType", operator: "equals", value: "employee" } }
    ] },
    { id: "equipment", title: { en: "Equipment", fa: "تجهیزات" }, fields: [
      { id: "equipment", type: "multi-select", label: { en: "Equipment", fa: "تجهیزات موردنیاز" }, options: [{ value: "laptop", label: { en: "Laptop", fa: "لپ‌تاپ" } }, { value: "phone", label: { en: "Phone", fa: "تلفن" } }, { value: "badge", label: { en: "Access badge", fa: "کارت دسترسی" } }] }
    ] },
    { id: "contacts", title: { en: "Emergency Contacts", fa: "تماس اضطراری" }, fields: [{ id: "emergencyContacts", type: "repeating-group", label: { en: "Emergency contacts", fa: "افراد تماس اضطراری" }, fields: [] }, { id: "attachments", type: "file", label: { en: "Documents", fa: "مدارک" } }] }
  ],
  steps: [
    { id: "personal", title: { en: "Personal", fa: "فردی" }, sectionIds: ["personal"] },
    { id: "employment", title: { en: "Employment", fa: "شغلی" }, sectionIds: ["employment"] },
    { id: "payroll", title: { en: "Payroll", fa: "پرداخت" }, sectionIds: ["payroll", "equipment"] },
    { id: "review", title: { en: "Review", fa: "بازبینی" }, sectionIds: ["personal", "employment", "payroll", "equipment", "contacts"] }
  ],
  rules: [
    { id: "contractor-bank-warning", when: { field: "employmentType", operator: "equals", value: "contractor" }, effects: [{ type: "warning", target: "bankAccount", message: { en: "Contractors are paid through vendor agreements.", fa: "پرداخت پیمانکاران از طریق قرارداد تامین‌کننده انجام می‌شود." } }, { type: "optional", target: "bankAccount" }] }
  ],
  submission: { submit: async () => ({ status: "succeeded", entityId: "employee-1001", entityVersion: 1 }) }
};
