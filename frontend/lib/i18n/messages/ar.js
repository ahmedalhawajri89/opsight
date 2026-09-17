/**
 * العربية — Arabic.
 *
 * Mirrors en.js key for key, with the same `{placeholders}`
 * (tests/i18n.test.js). Terminology matches the server's own Arabic
 * (backend/lang/ar) so a figure named on a chart and in an insight or a CSV
 * header is named the same way.
 *
 * CONVENTIONS
 *
 *  - Modern Standard Arabic in the register of Gulf business software: short,
 *    direct, imperative for actions (احفظ، ألغِ) and nouns for labels.
 *  - Accounting terms follow common GCC financial reporting usage: صافي
 *    الإيرادات، تكلفة البضاعة المباعة، مجمل الربح.
 *  - Counted nouns use the full Arabic plural rules. Where English has one
 *    string, Arabic may have a plural object: `Intl.PluralRules('ar')` gives
 *    zero / one / two / few (3–10) / many (11–99) / other (100+), and the
 *    counted noun agrees with each — منتج واحد، منتجان، ٣ منتجات، ١١ منتجًا.
 *  - Digits never appear literally in a sentence; they arrive through
 *    placeholders, already formatted in the reader's chosen numerals.
 *  - «» for quoted names, the Arabic comma ، and question mark ؟.
 */

const ar = {
  format: {
    // نقطة مئوية — the unit after a change between two ratios.
    pointsUnit: 'نقطة',
  },

  common: {
    appName: 'Opsight',
    tagline: 'العمليات وذكاء الأعمال',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    save: 'حفظ',
    close: 'إغلاق',
    yes: 'نعم',
    no: 'لا',
    walkIn: 'عميل مباشر',
    unknown: 'غير معروف',
    inactive: 'غير نشط',
    viewAll: 'عرض الكل',
  },

  shell: {
    account: 'الحساب: {name}',
    profile: 'الملف الشخصي',
    promo: {
      title: 'قرارات أفضل. أعمال أقوى.',
      body: 'يحوّل Opsight بياناتك إلى رؤى واضحة ونتائج حقيقية.',
    },
  },

  search: {
    label: 'البحث',
    placeholder: 'ابحث عن أي شيء…',
    hint: 'اكتب للوصول إلى أي شاشة، أو حرفين على الأقل للبحث في الطلبات والعملاء والمنتجات.',
    searching: 'جارٍ البحث…',
    noResults: 'لا توجد نتائج لـ«{query}».',
    groups: {
      pages: 'الشاشات',
      orders: 'الطلبات',
      customers: 'العملاء',
      products: 'المنتجات',
    },
  },

  notifications: {
    label: {
      zero: 'الإشعارات، لا توجد تغيّرات بارزة',
      one: 'الإشعارات، تغيّر بارز واحد',
      two: 'الإشعارات، تغيّران بارزان',
      few: 'الإشعارات، {count} تغيّرات بارزة',
      many: 'الإشعارات، {count} تغيّرًا بارزًا',
      other: 'الإشعارات، {count} تغيّر بارز',
    },
    title: 'أبرز التغيّرات',
    window: 'آخر شهر',
    empty: 'لا يوجد ما يستدعي انتباهك الآن.',
    viewAll: 'فتح لوحة المعلومات',
  },

  states: {
    empty: 'لا يوجد شيء هنا بعد',
    noResults: {
      title: 'لا توجد سجلات مطابقة',
      matching: 'لا توجد نتائج مطابقة',
      description: 'لا شيء يطابق عوامل التصفية الحالية.',
      clear: 'مسح عوامل التصفية',
    },
    error: {
      title: 'تعذّر تحميل هذا المحتوى',
      unexpected: 'حدث خطأ غير متوقع.',
      network: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم حاول مجددًا.',
      reference: 'المرجع: {reference}',
      retry: 'إعادة المحاولة',
    },
    forbidden: {
      title: 'غير متاح لدورك',
      description: 'اطلب من المالك منحك صلاحية الوصول إلى هذا القسم إن احتجت إليه.',
    },
  },

  auth: {
    sessionExpired: 'انتهت جلستك. يُرجى تسجيل الدخول مجددًا.',
    email: 'البريد الإلكتروني',
    emailRequired: 'البريد الإلكتروني مطلوب.',
    password: 'كلمة المرور',
    passwordRequired: 'كلمة المرور مطلوبة.',
    signIn: 'تسجيل الدخول',
    signingIn: 'جارٍ تسجيل الدخول…',
    noSelfRegistration: 'ينشئ المالك الحسابات. التسجيل الذاتي غير متاح.',
  },

  dialog: {
    close: 'إغلاق النافذة',
  },

  nav: {
    main: 'التنقل الرئيسي',
    skipToContent: 'تخطَّ إلى المحتوى',
    openNavigation: 'فتح قائمة التنقل',
    closeNavigation: 'إغلاق قائمة التنقل',
    signOut: 'تسجيل الخروج',
    comingLater: 'يتوفر في مرحلة لاحقة',
    groups: {
      overview: 'نظرة عامة',
      operations: 'العمليات',
      analysis: 'التحليلات',
      development: 'التطوير',
      administration: 'الإدارة',
    },
    items: {
      dashboard: 'لوحة المعلومات',
      orders: 'الطلبات',
      customers: 'العملاء',
      products: 'المنتجات',
      inventory: 'المخزون',
      expenses: 'المصروفات',
      analytics: 'التحليلات',
      reports: 'التقارير',
      gallery: 'معرض المكوّنات',
      activity: 'سجل النشاط',
      users: 'المستخدمون والأدوار',
      settings: 'الإعدادات',
    },
  },

  preferences: {
    language: 'اللغة',
    numerals: 'الأرقام',
    western: 'غربية',
    arabicIndic: 'عربية مشرقية',
  },

  period: {
    incomplete: 'غير مكتملة',
    inProgressTitle: 'هذه الفترة لم تنتهِ بعد',
    presets: {
      '7d': 'آخر {count} أيام',
      '30d': 'آخر {count} يومًا',
      '90d': 'آخر {count} يومًا',
      '365d': 'آخر {count} شهرًا',
      mtd: 'منذ بداية الشهر',
      qtd: 'منذ بداية الربع',
      ytd: 'منذ بداية السنة',
      custom: 'نطاق مخصص',
    },
    comparisons: {
      previous_period: 'الفترة السابقة',
      previous_year: 'الفترة نفسها من العام الماضي',
      none: 'بدون مقارنة',
    },
    selector: {
      period: 'الفترة',
      comparison: 'المقارنة',
      from: 'من تاريخ',
      to: 'إلى تاريخ',
    },
    status:
      'هذه الفترة لم تنتهِ بعد، وتُقارَن بفترة مكتملة، لذا ستبدو الأرقام أقل من حقيقتها حتى تنتهي.',
  },

  charts: {
    viewAsTable: 'عرض كجدول',
    viewAsChart: 'عرض كرسم بياني',
    noData: 'لا توجد بيانات لهذه الفترة',
    period: 'الفترة',
    complete: 'مكتملة',
    inProgress: 'جارية',
    stillInProgress: 'لم تنتهِ بعد',
    trendEmpty: 'لم تُسجَّل أي مبيعات في هذه الفترة، فلا يوجد اتجاه لعرضه.',
    partialFootnote: 'الفترة الأخيرة المظلّلة لم تنتهِ بعد، وستواصل الارتفاع.',
    name: 'الاسم',
    share: 'الحصة',
    rankEmpty: 'لم تُسجَّل أي مبيعات في هذه الفترة، فلا يوجد ما يُرتَّب.',
    otherFootnote:
      'كل ما يقع خارج الصفوف الأولى مجمَّع تحت «أخرى»، لذا يظل مجموع الحصص مساويًا للكل.',
    shareOfPeriod: '{share} من الفترة',
  },

  export: {
    label: 'تصدير CSV',
    preparing: 'جارٍ التجهيز…',
    forbidden: 'التصدير غير متاح لدورك.',
    failed: 'تعذّر تجهيز ملف التصدير.',
  },

  comparison: {
    unavailable: 'المقارنة غير متاحة — لم تكن للفترة السابقة قيمة يمكن المقارنة بها.',
    noValue: 'لا توجد قيمة لهذه الفترة.',
    whatIs: 'ما المقصود بـ«{label}»؟',
    previousLabel: 'السابقة',
    up: 'ارتفاع',
    down: 'انخفاض',
  },

  metrics: {
    net_revenue: {
      label: 'صافي الإيرادات',
      definition:
        'المجموع الفرعي بعد خصم الخصومات والمبالغ المستردة، للطلبات المُسجَّلة في هذه الفترة. لا يشمل الضريبة والشحن.',
    },
    gross_revenue: {
      label: 'إجمالي الإيرادات',
      definition: 'القيمة الكلية للبضاعة المباعة قبل الخصومات والضريبة والشحن والمبالغ المستردة.',
    },
    orders_count: {
      label: 'الطلبات',
      definition: 'الطلبات المعتمدة في هذه الفترة، باستثناء المسودات والطلبات الملغاة.',
    },
    units_sold: {
      label: 'الوحدات المبيعة',
      definition: 'إجمالي كمية الأصناف المبيعة، ولا تُخصم منها المبالغ المستردة.',
    },
    average_order_value: {
      label: 'متوسط قيمة الطلب',
      definition: 'صافي الإيرادات مقسومًا على عدد الطلبات.',
    },
    cogs: {
      label: 'تكلفة البضاعة المباعة',
      definition: 'ما دفعه النشاط التجاري ثمنًا للبضاعة المباعة، بالتكلفة المسجّلة لحظة البيع.',
    },
    gross_profit: {
      label: 'مجمل الربح',
      definition: 'صافي الإيرادات مطروحًا منه تكلفة البضاعة المباعة.',
    },
    gross_margin: {
      label: 'هامش الربح الإجمالي',
      definition: 'مجمل الربح كنسبة من صافي الإيرادات.',
    },
    operating_expenses: {
      label: 'المصروفات التشغيلية',
      definition:
        'تكاليف التشغيل المتكبَّدة في هذه الفترة، ولا تشمل تكلفة البضاعة المباعة التي تُحتسب على حدة.',
    },
    net_profit: {
      label: 'الربح التشغيلي',
      definition:
        'مجمل الربح مطروحًا منه المصروفات التشغيلية. رقم تشغيلي وليس رقمًا محاسبيًا نظاميًا.',
    },
    net_margin: {
      label: 'صافي هامش الربح',
      definition: 'صافي الربح كنسبة من صافي الإيرادات.',
    },
    cancellation_rate: {
      label: 'معدل الإلغاء',
      definition: 'الطلبات الملغاة كنسبة من جميع الطلبات المُسجَّلة، والمقام يشمل الطلبات الملغاة.',
    },
    refund_rate: {
      label: 'معدل الاسترداد',
      definition: 'القيمة المستردة كنسبة من إجمالي الإيرادات.',
    },
    new_customers: {
      label: 'العملاء الجدد',
      definition:
        'العملاء الذين وقع أول طلب لهم على الإطلاق في هذه الفترة، باستثناء العملاء المباشرين.',
    },
    returning_customers: {
      label: 'العملاء العائدون',
      definition: 'العملاء الذين طلبوا في هذه الفترة وسبق لهم الطلب قبلها.',
    },
  },

  dashboard: {
    description: 'أداء النشاط التجاري خلال الفترة المحددة',
    subtitle: 'إليك ما يحدث في نشاطك التجاري اليوم.',
    incompleteNote: 'هذه الفترة لم تنتهِ بعد، وتُقارَن بفترة مكتملة.',
    trend: {
      title: 'اتجاه الإيرادات والمصروفات',
      titleRevenueOnly: 'اتجاه الإيرادات',
      description: 'خلال الفترة المحددة',
      descriptionRevenueOnly: 'خلال الفترة المحددة',
      revenue: 'الإيرادات',
      expenses: 'المصروفات',
      rangeLabel: 'نطاق سريع',
      range: {
        days: '{count} ي',
        years: '{count} س',
      },
    },
    topSelling: {
      title: 'المنتجات الأعلى مبيعًا',
      product: 'المنتج',
      units: 'الوحدات المبيعة',
      revenue: 'الإيرادات',
      trend: 'الاتجاه',
    },
    quickStats: {
      title: 'إحصاءات سريعة',
      products: 'إجمالي المنتجات',
      customers: 'إجمالي العملاء',
      inventoryValue: 'قيمة المخزون',
      activeUsers: 'المستخدمون النشطون',
    },
    activity: {
      title: 'آخر النشاطات',
      empty: 'لم يُسجَّل أي نشاط بعد.',
      onSubject: '{verb} {subject}',
      byActor: '{actor} {verb}',
      exported: 'تصدير {resource} بصيغة CSV',
      verbs: {
        created: 'إنشاء',
        updated: 'تعديل',
        deleted: 'حذف',
        login: 'سجّل الدخول',
        logout: 'سجّل الخروج',
        login_failed: 'فشل تسجيل دخوله',
        lockout: 'أُوقف دخوله مؤقتًا',
        generated: 'تصدير',
        confirmed: 'تأكيد',
        fulfilled: 'إنجاز',
        cancelled: 'إلغاء',
        refunded: 'استرداد',
        activated: 'تفعيل',
        deactivated: 'إيقاف',
        role_changed: 'تغيير دور',
        password_changed: 'تغيير كلمة مرور',
      },
    },
    explore: {
      title: 'تحتاج إلى رؤى أعمق؟',
      body: 'استكشف الاتجاهات والتوزيعات والمقارنات وراء كل رقم في هذه اللوحة.',
      action: 'استكشف التحليلات',
    },
    sideColumn: 'ما يستحق الانتباه',
    revenueDescription: '{currency} · خلال الفترة المحددة',
    greeting: {
      morning: 'صباح الخير، {name}',
      afternoon: 'نهارك سعيد، {name}',
      evening: 'مساء الخير، {name}',
      morningAnonymous: 'صباح الخير',
      afternoonAnonymous: 'نهارك سعيد',
      eveningAnonymous: 'مساء الخير',
    },
    moreMetrics: {
      title: 'تفاصيل الأداء',
      description: 'الأرقام التي تفسّر المؤشرات الرئيسية',
    },
    categories: {
      title: 'المبيعات حسب فئة المنتج',
      description: 'توزيع الإيرادات حسب الفئة',
      total: 'صافي الإيرادات',
      sales: 'المبيعات',
      other: 'أخرى',
    },
    cashFlow: {
      title: 'أداء النشاط التجاري',
      description: {
        zero: '{currency}',
        one: '{currency} · الشهر الأخير',
        two: '{currency} · الشهران الأخيران',
        few: '{currency} · آخر {count} أشهر',
        many: '{currency} · آخر {count} شهرًا',
        other: '{currency} · آخر {count} شهر',
      },
      revenue: 'صافي الإيرادات',
      expenses: 'المصروفات',
      month: 'الشهر',
      partialFootnote: 'الأعمدة الأفتح تمثّل الشهر الحالي، ولم ينتهِ بعد.',
    },
    inventory: {
      title: 'حالة المخزون',
      inStock: 'متوفر',
      low: 'منخفض',
      out: 'نافد',
      products: {
        zero: 'لا منتجات',
        one: 'منتج واحد',
        two: 'منتجان',
        few: '{count} منتجات',
        many: '{count} منتجًا',
        other: '{count} منتج',
      },
    },
    keyMetrics: 'المؤشرات الرئيسية',
    profitDescription: 'صافي الإيرادات بعد طرح تكلفة البضاعة وقت البيع',
    topProducts: {
      title: 'المنتجات الأعلى مبيعًا',
      description: 'حسب صافي الإيرادات، مجمَّعة برمز المنتج المسجَّل وقت البيع',
      caption: 'المنتجات الأعلى حسب صافي الإيرادات',
      rank: '#',
      product: 'المنتج',
      revenue: 'الإيرادات',
      viewAll: 'كل المنتجات',
    },
    lowStock: {
      title: 'مخزون منخفض',
      description: 'الوضع الحالي — لا يرتبط بالفترة المحددة',
      count: {
        zero: 'لا منتجات دون حد إعادة الطلب',
        one: 'منتج واحد دون حد إعادة الطلب',
        two: 'منتجان دون حد إعادة الطلب',
        few: '{count} منتجات دون حد إعادة الطلب',
        many: '{count} منتجًا دون حد إعادة الطلب',
        other: '{count} منتج دون حد إعادة الطلب',
      },
      none: 'لا يوجد منتج بلغ حد إعادة الطلب أو أقل منه.',
      left: 'متبقٍّ',
      reorderPoint: 'حد إعادة الطلب {value}',
      viewAll: 'عرض المخزون كاملًا',
    },
    recentOrders: {
      title: 'أحدث الطلبات',
      date: 'التاريخ',
      description: 'آخر النشاطات بغض النظر عن الفترة المحددة',
      all: 'كل الطلبات',
      empty: 'لا توجد طلبات بعد',
      order: 'الطلب',
      customer: 'العميل',
      status: 'الحالة',
      placed: 'تاريخ الطلب',
      total: 'الإجمالي',
    },
  },

  insights: {
    title: 'أبرز التغيّرات',
    description: 'فحوص قائمة على قواعد لهذه الأرقام وللمخزون الحالي',
    heldBackPartial: 'مؤجَّلة حتى تنتهي هذه الفترة',
    heldBack: 'محجوبة لهذه الفترة',
    nothingCrossed: 'لم يتجاوز أي شيء في هذه الفترة حدود التنبيه.',
    severity: {
      warning: 'تحذير',
      action: 'إجراء مطلوب',
      positive: 'خبر جيد',
      opportunity: 'فرصة',
      data_quality: 'جودة البيانات',
    },
    links: {
      inventory: 'مراجعة المخزون',
      customers: 'عرض العملاء',
      expenses: 'مراجعة المصروفات',
      figures: 'مراجعة الأرقام',
    },
  },

  filters: {
    search: 'البحث',
    status: 'الحالة',
    placed_from: 'تاريخ الطلب من',
    placed_to: 'تاريخ الطلب إلى',
    is_active: 'نشط',
    low_stock: 'مخزون منخفض',
    incurred_from: 'تاريخ الصرف من',
    incurred_to: 'تاريخ الصرف إلى',
    expense_category_id: 'الفئة',
    category_id: 'الفئة',
    country: 'الدولة',
    role: 'الدور',
    action: 'الإجراء',
    subject_type: 'العنصر',
    user_id: 'المستخدم',
    from: 'من',
    to: 'إلى',
    cursor: 'الموضع',
    sort: 'الترتيب',
    page: 'الصفحة',
    per_page: 'عدد الصفوف في الصفحة',
  },

  orders: {
    description: 'كل عملية بيع معتمدة، والمسودات في طريقها إلى الاعتماد.',
    new: 'طلب جديد',
    searchPlaceholder: 'ابحث برقم المرجع…',
    searchLabel: 'البحث في الطلبات',
    anyStatus: 'كل الحالات',
    columns: {
      order: 'الطلب',
      customer: 'العميل',
      status: 'الحالة',
      placed: 'تاريخ الطلب',
      total: 'الإجمالي',
    },
    empty: {
      title: 'لا توجد طلبات بعد',
      description: 'ستظهر هنا الطلبات التي تُنشئها مع حالتها وتواريخها وإجمالياتها.',
      action: 'أنشئ الطلب الأول',
    },
  },

  catalog: {
    activeState: 'حالة التفعيل',
    activeOnly: 'النشطة فقط',
    inactiveOnly: 'غير النشطة فقط',
    stockLevel: 'مستوى المخزون',
    anyStockLevel: 'كل مستويات المخزون',
    lowStockOnly: 'المخزون المنخفض فقط',
  },

  customers: {
    description:
      'سجل الطلبات والقيمة الدائمة للعميل والنمو تُحتسب من الطلبات — فهي مؤشرات وليست حقولًا مخزّنة.',
    searchPlaceholder: 'ابحث بالاسم أو البريد أو الشركة…',
    searchLabel: 'البحث في العملاء',
    all: 'كل العملاء',
    columns: {
      customer: 'العميل',
      email: 'البريد الإلكتروني',
      company: 'الشركة',
      country: 'الدولة',
      added: 'تاريخ الإضافة',
    },
    empty: {
      title: 'لا يوجد عملاء بعد',
      description: 'ربط الطلبات بالعملاء هو ما يجعل النمو والاحتفاظ بالعملاء قابلَين للقياس.',
    },
  },

  products: {
    description:
      'دليل المنتجات. تعديل السعر أو التكلفة يؤثر في الطلبات القادمة فقط — تحتفظ الطلبات السابقة بقيمها المسجّلة.',
    searchPlaceholder: 'ابحث بالاسم أو رمز المنتج…',
    searchLabel: 'البحث في المنتجات',
    all: 'كل المنتجات',
    columns: {
      category: 'الفئة',
      price: 'السعر',
      cost: 'التكلفة',
      stock: 'المخزون',
    },
    empty: {
      title: 'لا توجد منتجات بعد',
      description: 'توفّر المنتجات السعر والتكلفة المعتمدَين لحظة البيع.',
    },
  },

  inventory: {
    description: 'المخزون المتوفر ملخّص لسجل حركات لا يقبل إلا الإضافة. كل تغيير يُسجَّل مع سببه.',
    searchPlaceholder: 'ابحث بالمنتج أو رمز المنتج…',
    searchLabel: 'البحث في المخزون',
    adjust: 'تعديل',
    columns: {
      onHand: 'المتوفر',
      reorderAt: 'حد إعادة الطلب',
      lastMovement: 'آخر حركة',
    },
    empty: {
      title: 'لا توجد سجلات مخزون بعد',
      description: 'يُنشأ سجل مخزون لكل منتج عند إضافته.',
    },
    dialog: {
      title: 'تعديل مخزون «{product}»',
      current: 'المتوفر حاليًا: {count}.',
      receive: 'استلام المخزون',
      apply: 'تطبيق التعديل',
      type: 'النوع',
      typeAdjust: 'تصحيح أو تلف أو فقد',
      typeRestock: 'استلام مخزون',
      change: 'مقدار التغيير',
      changeHint: 'قيمة بإشارة: {remove} تُنقص ثلاث وحدات، و{add} تضيف خمسًا.',
      reasonCount: 'تصحيح بعد الجرد',
      reasonDamage: 'تالف',
      reasonLoss: 'مفقود',
      quantityReceived: 'الكمية المستلمة',
      unitCostHint: 'تُسجَّل على الحركة، ولا تغيّر تكلفة المنتج في الدليل.',
      note: 'ملاحظة',
      noteHint: 'عند مراجعة السجل لاحقًا، لا يمكن تمييز تغيير غير مبرَّر في المخزون عن السرقة.',
      noExpense:
        'استلام المخزون <strong>لا</strong> يُنشئ مصروفًا. تصل تكلفة المخزون إلى الربح عبر تكلفة البضاعة المباعة عند البيع — وتسجيلها مصروفًا أيضًا يعني احتسابها مرتين.',
    },
  },

  expenses: {
    description:
      'المصروفات التشغيلية فقط. مشتريات المخزون تصل إلى الربح عبر تكلفة البضاعة المباعة عند البيع — وتسجيلها هنا يعني احتسابها مرتين.',
    searchPlaceholder: 'ابحث بالوصف أو المورّد…',
    searchLabel: 'البحث في المصروفات',
    anyCategory: 'كل الفئات',
    columns: {
      incurred: 'تاريخ الصرف',
      description: 'الوصف',
      vendor: 'المورّد',
      amount: 'المبلغ',
    },
    empty: {
      title: 'لا توجد مصروفات مسجّلة',
      description: 'من دون المصروفات، يعرض Opsight الإيرادات لا الأرباح.',
    },
  },

  analytics: {
    description: 'كل رقم هنا يُحتسب من السجلات الأصلية لحظة طلبه، ولا يُخزَّن شيء منه.',
    partial: 'هذه الفترة لم تنتهِ بعد، وتُقارَن بفترة مكتملة.',
    trend: 'الاتجاه',
    metric: 'المؤشر',
    grain: 'الدقة الزمنية',
    automatic: 'تلقائي',
    breakDownBy: 'التوزيع حسب',
    grains: {
      day: 'يومي',
      week: 'أسبوعي',
      month: 'شهري',
    },
    dimensions: {
      product: 'المنتج',
      category: 'الفئة',
      customer: 'العميل',
    },
    breakdownTitles: {
      product: 'صافي الإيرادات حسب المنتج',
      category: 'صافي الإيرادات حسب الفئة',
      customer: 'صافي الإيرادات حسب العميل',
    },
    breakdownDescription: 'مرتّبة تنازليًا، وما يقع خارج العشرة الأوائل مجمَّع تحت «أخرى»',
    help: {
      title: 'كيف تقرأ هذه الأرقام',
      revenue:
        'لا تشمل الإيرادات الضريبة والشحن؛ فالضريبة تُحصَّل لصالح الجهة الضريبية، والشحن يُعامَل كاسترداد للتكلفة.',
      cost: 'تعتمد تكلفة البضاعة المباعة على التكلفة المسجّلة <strong>لحظة البيع</strong>، لذا فإن تغيير تكلفة المنتج اليوم لا يغيّر أي رقم سابق.',
      refund:
        'يُخصم الاسترداد من الفترة التي <strong>سُجِّل</strong> فيها الطلب، لا من الفترة التي صدر فيها الاسترداد.',
      emDash:
        'الشرطة الطويلة (—) تعني أن الرقم لا يمكن حسابه، وغالبًا بسبب القسمة على صفر. ولا تعني صفرًا أبدًا.',
      points: 'يُعرض التغيّر بين نسبتين بـ<strong>النقاط</strong> المئوية، لا بالنسبة المئوية.',
    },
  },

  activity: {
    description:
      'سجل لا يقبل إلا الإضافة. لا شيء في هذا التطبيق يمكنه تعديل أي قيد أو حذفه، وكل تصدير لهذا السجل يُسجَّل فيه أيضًا.',
    anyAction: 'كل الإجراءات',
    notSignedIn: 'غير مسجّل الدخول',
    columns: {
      when: 'الوقت',
      action: 'الإجراء',
      who: 'المنفِّذ',
      subject: 'العنصر',
      detail: 'التفاصيل',
    },
    empty: {
      title: 'لا يوجد نشاط مطابق',
      description: 'لم يُسجَّل أي شيء لعوامل التصفية هذه.',
    },
    moreFields: {
      zero: '',
      one: 'وحقل آخر',
      two: 'وحقلان آخران',
      few: 'و{count} حقول أخرى',
      many: 'و{count} حقلًا آخر',
      other: 'و{count} حقل آخر',
    },
    pagerNote:
      'الأحدث أولًا. التنقل بالموضع لا برقم الصفحة، حتى لا يسقط أي قيد بين صفحتين عند وصول قيود جديدة.',
    newer: 'الأحدث',
    older: 'الأقدم',
    subjects: {
      auth: 'الدخول',
      export: 'التصدير',
      order: 'الطلب',
      orderitem: 'بند الطلب',
      product: 'المنتج',
      category: 'الفئة',
      customer: 'العميل',
      expense: 'المصروف',
      expensecategory: 'فئة المصروفات',
      inventory: 'المخزون',
      user: 'المستخدم',
      settings: 'الإعدادات',
    },
    subjectTypes: {
      Order: 'طلب',
      OrderItem: 'بند طلب',
      Product: 'منتج',
      Category: 'فئة',
      Customer: 'عميل',
      Expense: 'مصروف',
      ExpenseCategory: 'فئة مصروفات',
      InventoryMovement: 'حركة مخزون',
      User: 'مستخدم',
      BusinessSetting: 'الإعدادات',
    },
    verbs: {
      created: 'إنشاء',
      updated: 'تعديل',
      deleted: 'حذف',
      login: 'تسجيل دخول',
      logout: 'تسجيل خروج',
      login_failed: 'محاولة دخول فاشلة',
      lockout: 'قفل مؤقت',
      generated: 'إنشاء ملف',
      confirmed: 'تأكيد',
      fulfilled: 'إنجاز',
      cancelled: 'إلغاء',
      refunded: 'استرداد',
      activated: 'تفعيل',
      deactivated: 'إيقاف',
      role_changed: 'تغيير الدور',
      password_changed: 'تغيير كلمة المرور',
    },
    fields: {
      name: 'الاسم',
      email: 'البريد الإلكتروني',
      role: 'الدور',
      is_active: 'نشط',
      locale: 'اللغة',
      numerals: 'الأرقام',
      status: 'الحالة',
      reason: 'السبب',
      lines: 'البنود',
      amount: 'المبلغ',
      soft_delete: 'قابل للاستعادة',
      resource: 'الملف',
      rows: 'الصفوف',
      filters: 'عوامل التصفية',
      sort: 'الترتيب',
      sku: 'رمز المنتج',
      price: 'السعر',
      cost: 'التكلفة',
      quantity: 'الكمية',
      quantity_delta: 'مقدار التغيير',
      balance_after: 'الرصيد بعد الحركة',
      stock_on_hand: 'المتوفر',
      reorder_point: 'حد إعادة الطلب',
      unit_cost: 'تكلفة الوحدة',
      unit_price: 'سعر الوحدة',
      note: 'الملاحظة',
      notes: 'الملاحظات',
      description: 'الوصف',
      vendor: 'المورّد',
      company: 'الشركة',
      country: 'الدولة',
      city: 'المدينة',
      phone: 'الهاتف',
      currency: 'العملة',
      currency_decimals: 'المنازل العشرية',
      timezone: 'المنطقة الزمنية',
      fiscal_year_start_month: 'بداية السنة المالية',
      company_name: 'اسم الشركة',
      default_low_stock_threshold: 'حد المخزون المنخفض',
      total_amount: 'الإجمالي',
      subtotal_amount: 'المجموع الفرعي',
      refunded_amount: 'المبلغ المسترد',
      cancellation_reason: 'سبب الإلغاء',
    },
  },

  roles: {
    owner: 'مالك',
    manager: 'مدير',
    analyst: 'محلل',
    staff: 'موظف',
  },

  users: {
    description:
      'تُوقَف الحسابات ولا تُحذف أبدًا؛ فحذف المستخدم يمحو سجل تدقيقه، ويصبح كل إجراء سابق له بلا منفِّذ معروف.',
    add: 'إضافة مستخدم',
    create: 'إنشاء المستخدم',
    searchPlaceholder: 'ابحث بالاسم أو البريد الإلكتروني…',
    searchLabel: 'البحث في المستخدمين',
    anyRole: 'كل الأدوار',
    you: '(أنت)',
    roleFor: 'دور {name}',
    active: 'نشط',
    deactivated: 'موقوف',
    never: 'لم يسجّل الدخول',
    deactivate: 'إيقاف',
    reactivate: 'إعادة التفعيل',
    empty: 'لا يوجد مستخدمون مطابقون',
    columns: {
      name: 'الاسم',
      lastSignedIn: 'آخر تسجيل دخول',
    },
    confirm: {
      title: 'إيقاف هذا الحساب؟',
      consequence:
        'سيفقد {name} صلاحية الوصول مع طلبه التالي حتى لو كان مسجّل الدخول الآن، ولن يتمكن من تسجيل الدخول مجددًا. يبقى كل ما قام به سابقًا محفوظًا في السجل.',
      consequenceUnnamed:
        'سيفقد هذا المستخدم صلاحية الوصول مع طلبه التالي حتى لو كان مسجّل الدخول الآن، ولن يتمكن من تسجيل الدخول مجددًا. يبقى كل ما قام به سابقًا محفوظًا في السجل.',
    },
    passwordHint: '{count} حرفًا على الأقل. يُفضَّل أن يغيّرها المستخدم الجديد بعد تسجيل دخوله.',
    confirmPassword: 'تأكيد كلمة المرور',
  },

  settings: {
    description:
      'إعدادات النشاط التجاري، قابلة للتعديل أثناء التشغيل. هذه قرارات تتخذها الشركة لا الخادم، لذلك مكانها هنا لا في ملفات النشر.',
    readOnly:
      'تُعرض هذه القيم لأن كل شاشة تحتاج إلى العملة والمنطقة الزمنية لعرض الأرقام بدقة. وحده المالك يستطيع تغييرها.',
    business: {
      title: 'النشاط التجاري',
      description: 'الهوية وتنسيق المبالغ',
    },
    companyName: 'اسم الشركة',
    currency: 'العملة',
    currencyHint: 'رمز ISO 4217، مثل BHD. عملة واحدة للنظام بأكمله.',
    decimals: 'المنازل العشرية',
    decimalsHint: 'ثلاث منازل للدينار البحريني، ومنزلتان لمعظم العملات.',
    lowStock: 'حد المخزون المنخفض',
    lowStockHint: 'يُطبَّق على أي منتج لم يُحدَّد له حد خاص.',
    periods: {
      title: 'فترات التقارير',
      description:
        'هذان الحقلان يحددان بداية كل فترة ونهايتها. تغيير أي منهما لا يمس أي سجل، لكنه يغيّر الشهر أو الربع أو السنة التي يُحتسب فيها، فتتغير الإجماليات التاريخية.',
      warning:
        'غيّرت حقلًا يؤثر في الأرقام التاريخية. الحفظ سيغيّر الإجماليات المعروضة لفترات أُغلقت بالفعل، دون أن يعدّل الطلبات أو المصروفات نفسها.',
    },
    timezone: 'المنطقة الزمنية للنشاط',
    fiscalYear: 'بداية السنة المالية',
    save: 'حفظ الإعدادات',
    saved: 'تم الحفظ، وأُعيد احتساب كل الأرقام المعروضة.',
  },

  orderDetail: {
    walkIn: 'عميل مباشر — بلا سجل عميل',
    timeline: 'المسار الزمني',
    placed: 'تاريخ الطلب',
    fulfilled: 'تاريخ الإنجاز',
    cancelled: 'تاريخ الإلغاء',
    reason: 'السبب',
    refunded: 'المبلغ المسترد',
    refundAmount: 'مبلغ الاسترداد',
    draftNote:
      'هذا الطلب مسودة. لا يظهر في أي مؤشر حتى يُؤكَّد، وتُثبَّت الأسعار لحظة التأكيد — لا الآن.',
    totals: 'الإجماليات',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    tax: 'الضريبة',
    shipping: 'الشحن',
    total: 'الإجمالي',
    taxNote:
      'الضريبة والشحن لا يدخلان في الإيرادات؛ فالضريبة تُحصَّل لصالح الجهة الضريبية، والشحن يُعامَل كاسترداد للتكلفة.',
    items: 'البنود',
    itemsCaption: 'بنود الطلب {reference}',
    columns: {
      sku: 'رمز المنتج',
      product: 'المنتج',
      quantity: 'الكمية',
      unitPrice: 'سعر الوحدة',
      unitCost: 'تكلفة الوحدة',
      lineTotal: 'إجمالي البند',
    },
  },

  newOrder: {
    description: 'ابدأ مسودة، ثم أضف إليها البنود.',
    draftDescription: 'المسودة {reference} — أضف البنود ثم أكّد الطلب.',
    details: 'تفاصيل الطلب',
    customer: 'العميل',
    customerHint: 'اتركه فارغًا لعميل مباشر — لا يُحتسب هؤلاء في مؤشرات العملاء الجدد.',
    walkInOption: 'عميل مباشر (بلا عميل)',
    notes: 'الملاحظات',
    notesPlaceholder: 'أي معلومة تستحق التسجيل عن هذا الطلب…',
    start: 'بدء المسودة',
    addItemTitle: 'إضافة بند',
    chooseProduct: 'اختر منتجًا',
    quantity: 'الكمية',
    addItem: 'إضافة البند',
    priceNote:
      'الأسعار المعروضة على المسودة استرشادية. الأرقام المعتمدة تُثبَّت من دليل المنتجات لحظة التأكيد.',
    draftItems: 'بنود المسودة',
    noItems: 'لا توجد بنود بعد',
    noItemsDescription: 'لا يمكن تأكيد الطلب قبل أن يحتوي على بند واحد على الأقل.',
    remove: 'إزالة',
    saveAndView: 'حفظ وعرض المسودة',
  },

  orderActions: {
    confirm: 'تأكيد الطلب',
    fulfil: 'تحديد كمُنجَز',
    cancel: 'إلغاء الطلب',
    refund: 'تسجيل استرداد',
    cancelTitle: 'إلغاء الطلب {reference}؟',
    cancelConsequence: {
      zero: 'لن يُعيد هذا أي وحدات إلى المخزون، وسيخصم {amount} من إيرادات الفترة التي سُجِّل فيها الطلب. يبقى الطلب في السجل بحالة «ملغى».',
      one: 'سيُعيد هذا وحدة واحدة إلى المخزون، ويخصم {amount} من إيرادات الفترة التي سُجِّل فيها الطلب. يبقى الطلب في السجل بحالة «ملغى».',
      two: 'سيُعيد هذا وحدتين إلى المخزون، ويخصم {amount} من إيرادات الفترة التي سُجِّل فيها الطلب. يبقى الطلب في السجل بحالة «ملغى».',
      few: 'سيُعيد هذا {count} وحدات إلى المخزون، ويخصم {amount} من إيرادات الفترة التي سُجِّل فيها الطلب. يبقى الطلب في السجل بحالة «ملغى».',
      many: 'سيُعيد هذا {count} وحدة إلى المخزون، ويخصم {amount} من إيرادات الفترة التي سُجِّل فيها الطلب. يبقى الطلب في السجل بحالة «ملغى».',
      other:
        'سيُعيد هذا {count} وحدة إلى المخزون، ويخصم {amount} من إيرادات الفترة التي سُجِّل فيها الطلب. يبقى الطلب في السجل بحالة «ملغى».',
    },
    reason: 'السبب',
    reasonPlaceholder: 'لماذا يُلغى هذا الطلب؟',
    refundTitle: 'تسجيل استرداد للطلب {reference}',
    refundTotal: 'إجمالي الطلب {amount}.',
    refundAmount: 'مبلغ الاسترداد',
    returnStock: 'إعادة البضاعة إلى المخزون',
    returnStockHint:
      'اترك هذا الخيار دون تحديد إذا كانت البضاعة تالفة — فإعادتها إلى المخزون تُضخّم الكمية القابلة للبيع.',
    refundPeriodNote:
      'يُخصم الاسترداد من إيرادات الفترة التي <strong>سُجِّل</strong> فيها الطلب، لا من إيرادات اليوم.',
  },

  orderStatus: {
    draft: 'مسودة',
    confirmed: 'مؤكَّد',
    fulfilled: 'مُنجَز',
    cancelled: 'ملغى',
    refunded: 'مُسترَد',
  },

  pagination: {
    none: 'لا توجد سجلات',
    range: '{first}–{last} من {total}',
    rows: 'الصفوف',
    previous: 'السابق',
    next: 'التالي',
    previousPage: 'الصفحة السابقة',
    nextPage: 'الصفحة التالية',
    page: '{page} / {pages}',
  },
};

export default ar;
