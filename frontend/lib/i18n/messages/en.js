/**
 * English — the source dictionary.
 *
 * Every other language must carry exactly these keys and exactly these
 * `{placeholders}` (tests/i18n.test.js). A key missing in another language
 * falls back to the English text rather than showing the raw key, but the test
 * stops that reaching a release.
 *
 * Organised by where a string appears rather than by what it says, so a
 * translator working through a screen finds its strings together.
 */

const en = {
  format: {
    // Percentage points: the unit after a change between two ratios.
    pointsUnit: 'pp',
  },

  common: {
    appName: 'Opsight',
    tagline: 'Operations & Business Intelligence',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    close: 'Close',
    yes: 'Yes',
    no: 'No',
    walkIn: 'Walk-in',
    unknown: 'Unknown',
    inactive: 'Inactive',
    viewAll: 'View all',
  },

  shell: {
    account: 'Account: {name}',
    profile: 'Profile',
    promo: {
      title: 'Better decisions. Stronger business.',
      body: 'Opsight turns your data into clear insights and real results.',
    },
  },

  search: {
    label: 'Search',
    placeholder: 'Search anything…',
    hint: 'Type to find a screen, or at least two characters to search orders, customers and products.',
    searching: 'Searching…',
    noResults: 'Nothing found for “{query}”.',
    groups: {
      pages: 'Screens',
      orders: 'Orders',
      customers: 'Customers',
      products: 'Products',
    },
  },

  notifications: {
    label: {
      one: 'Notifications, {count} key change',
      other: 'Notifications, {count} key changes',
    },
    title: 'Key changes',
    window: 'Last 30 days',
    empty: 'Nothing needs your attention right now.',
    viewAll: 'Open the dashboard',
  },

  states: {
    empty: 'Nothing here yet',
    noResults: {
      title: 'No matching records',
      matching: 'Nothing matches',
      description: 'Nothing matches the current filters.',
      clear: 'Clear filters',
    },
    error: {
      title: 'Could not load this',
      unexpected: 'An unexpected error occurred.',
      network: 'Could not reach the server. Check your connection and try again.',
      reference: 'Reference: {reference}',
      retry: 'Try again',
    },
    forbidden: {
      title: 'Not available for your role',
      description: 'Ask an owner if you need access to this area.',
    },
  },

  auth: {
    sessionExpired: 'Your session expired. Please sign in again.',
    email: 'Email',
    emailRequired: 'Email is required.',
    password: 'Password',
    passwordRequired: 'Password is required.',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    noSelfRegistration: 'Accounts are created by an owner. Self-registration is disabled.',
  },

  dialog: {
    close: 'Close dialog',
  },

  nav: {
    main: 'Main',
    skipToContent: 'Skip to content',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    signOut: 'Sign out',
    comingLater: 'Arrives in a later phase',
    groups: {
      overview: 'Overview',
      operations: 'Operations',
      analysis: 'Analytics',
      development: 'Development',
      administration: 'Administration',
    },
    items: {
      dashboard: 'Dashboard',
      orders: 'Orders',
      customers: 'Customers',
      products: 'Products',
      inventory: 'Inventory',
      expenses: 'Expenses',
      analytics: 'Analytics',
      reports: 'Reports',
      gallery: 'Component gallery',
      activity: 'Activity Log',
      users: 'Users & Roles',
      settings: 'Settings',
    },
  },

  preferences: {
    language: 'Language',
    numerals: 'Digits',
    western: 'Western',
    arabicIndic: 'Arabic-Indic',
  },

  period: {
    incomplete: 'Incomplete',
    inProgressTitle: 'This period is still in progress',
    presets: {
      '7d': 'Last {count} days',
      '30d': 'Last {count} days',
      '90d': 'Last {count} days',
      '365d': 'Last {count} months',
      mtd: 'Month to date',
      qtd: 'Quarter to date',
      ytd: 'Year to date',
      custom: 'Custom range',
    },
    comparisons: {
      previous_period: 'Previous period',
      previous_year: 'Same period last year',
      none: 'No comparison',
    },
    selector: {
      period: 'Period',
      comparison: 'Comparison',
      from: 'From date',
      to: 'To date',
    },
    status:
      'This period is still in progress, so it is being compared against a complete one. Expect figures to read low until it finishes.',
  },

  charts: {
    viewAsTable: 'View as table',
    viewAsChart: 'View as chart',
    noData: 'No data for this period',
    period: 'Period',
    complete: 'Complete',
    inProgress: 'In progress',
    stillInProgress: 'Still in progress',
    trendEmpty: 'Nothing was sold in this period, so there is no trend to draw.',
    partialFootnote: 'The shaded final period is still in progress and will keep rising.',
    name: 'Name',
    share: 'Share',
    rankEmpty: 'Nothing was sold in this period, so there is nothing to rank.',
    otherFootnote:
      'Everything outside the top rows is grouped as Other, so the shares still sum to the whole.',
    shareOfPeriod: '{share} of the period',
  },

  export: {
    label: 'Export CSV',
    preparing: 'Preparing…',
    forbidden: 'Exporting is not available for your role.',
    failed: 'The export could not be prepared.',
  },

  comparison: {
    unavailable: 'No comparison available — the previous period had no value to compare against.',
    noValue: 'No value for this period.',
    whatIs: 'What is {label}?',
    previousLabel: 'Previous',
    up: 'Up',
    down: 'Down',
  },

  metrics: {
    net_revenue: {
      label: 'Net revenue',
      definition:
        'Subtotal less discounts and refunds, for orders placed in this period. Excludes tax and shipping.',
    },
    gross_revenue: {
      label: 'Gross revenue',
      definition: 'Total value of goods sold, before discounts, tax, shipping and refunds.',
    },
    orders_count: {
      label: 'Orders',
      definition: 'Orders committed in this period. Drafts and cancellations are excluded.',
    },
    units_sold: {
      label: 'Units sold',
      definition: 'Total item quantity sold. Not reduced by refunds.',
    },
    average_order_value: {
      label: 'Average order value',
      definition: 'Net revenue divided by the number of orders.',
    },
    cogs: {
      label: 'Cost of goods',
      definition:
        'What the business paid for the goods sold, using the cost recorded at the moment of sale.',
    },
    gross_profit: {
      label: 'Gross profit',
      definition: 'Net revenue less cost of goods.',
    },
    gross_margin: {
      label: 'Gross margin',
      definition: 'Gross profit as a proportion of net revenue.',
    },
    operating_expenses: {
      label: 'Operating expenses',
      definition:
        'Running costs incurred in this period. Excludes cost of goods, which is counted separately.',
    },
    net_profit: {
      label: 'Operating profit',
      definition: 'Gross profit less operating expenses. An operating figure, not a statutory one.',
    },
    net_margin: {
      label: 'Net margin',
      definition: 'Net profit as a proportion of net revenue.',
    },
    cancellation_rate: {
      label: 'Cancellation rate',
      definition:
        'Cancelled orders as a share of all orders placed. The denominator includes cancellations.',
    },
    refund_rate: {
      label: 'Refund rate',
      definition: 'Refunded value as a share of gross revenue.',
    },
    new_customers: {
      label: 'New customers',
      definition:
        'Customers whose first ever order falls in this period. Walk-in trade is excluded.',
    },
    returning_customers: {
      label: 'Returning customers',
      definition: 'Customers who ordered in this period and had ordered before it.',
    },
  },

  dashboard: {
    description: 'Business performance for the selected period',
    subtitle: 'Here’s what’s happening with your business today.',
    incompleteNote:
      'This period is still in progress, so it is being compared against a complete one.',
    trend: {
      title: 'Revenue & Expenses Trend',
      titleRevenueOnly: 'Revenue Trend',
      description: 'Over the selected period',
      descriptionRevenueOnly: 'Over the selected period',
      revenue: 'Revenue',
      expenses: 'Expenses',
      rangeLabel: 'Quick range',
      range: {
        days: '{count}D',
        years: '{count}Y',
      },
    },
    topSelling: {
      title: 'Top Selling Products',
      product: 'Product',
      units: 'Units Sold',
      revenue: 'Revenue',
      trend: 'Trend',
    },
    quickStats: {
      title: 'Quick Stats',
      products: 'Total Products',
      customers: 'Total Customers',
      inventoryValue: 'Total Inventory Value',
      activeUsers: 'Active Users',
    },
    activity: {
      title: 'Recent Activity',
      empty: 'Nothing has been recorded yet.',
      onSubject: '{subject} {verb}',
      byActor: '{actor} {verb}',
      exported: 'Exported {resource} as CSV',
      verbs: {
        created: 'created',
        updated: 'updated',
        deleted: 'deleted',
        login: 'signed in',
        logout: 'signed out',
        login_failed: 'failed to sign in',
        lockout: 'was locked out',
        generated: 'exported',
        confirmed: 'confirmed',
        fulfilled: 'fulfilled',
        cancelled: 'cancelled',
        refunded: 'refunded',
        activated: 'activated',
        deactivated: 'deactivated',
        role_changed: 'role changed',
        password_changed: 'password changed',
      },
    },
    explore: {
      title: 'Need deeper insights?',
      body: 'Explore trends, breakdowns and comparisons behind every figure on this dashboard.',
      action: 'Explore Analytics',
    },
    sideColumn: 'Attention',
    revenueDescription: '{currency} · over the selected period',
    greeting: {
      morning: 'Good morning, {name}',
      afternoon: 'Good afternoon, {name}',
      evening: 'Good evening, {name}',
      morningAnonymous: 'Good morning',
      afternoonAnonymous: 'Good afternoon',
      eveningAnonymous: 'Good evening',
    },
    moreMetrics: {
      title: 'Performance details',
      description: 'The figures behind the headline numbers',
    },
    categories: {
      title: 'Sales by Product Category',
      description: 'Revenue distribution by category',
      total: 'Net revenue',
      sales: 'Sales',
      other: 'Other',
    },
    cashFlow: {
      title: 'Business Performance',
      description: {
        one: '{currency} · the last month',
        other: '{currency} · the last {count} months',
      },
      revenue: 'Net revenue',
      expenses: 'Expenses',
      month: 'Month',
      partialFootnote: 'The lighter bars are the current month, which is still in progress.',
    },
    inventory: {
      title: 'Inventory Status',
      inStock: 'In Stock',
      low: 'Low Stock',
      out: 'Out of Stock',
      products: {
        one: '{count} product',
        other: '{count} products',
      },
    },
    keyMetrics: 'Key metrics',
    profitDescription: 'net revenue less cost of goods at the time of sale',
    topProducts: {
      title: 'Top products',
      description: 'By net revenue, grouped by the SKU recorded at the time of sale',
      caption: 'Top products by net revenue',
      rank: '#',
      product: 'Product',
      revenue: 'Revenue',
      viewAll: 'All products',
    },
    lowStock: {
      title: 'Low stock',
      description: 'As of now — not for the selected period',
      count: {
        one: '{count} below reorder point',
        other: '{count} below reorder point',
      },
      none: 'Nothing is at or below its reorder point.',
      left: 'left',
      reorderPoint: 'Reorder point {value}',
      viewAll: 'View all inventory',
    },
    recentOrders: {
      title: 'Recent Orders',
      date: 'Date',
      description: 'Latest activity, regardless of the selected period',
      all: 'All orders',
      empty: 'No orders yet',
      order: 'Order',
      customer: 'Customer',
      status: 'Status',
      placed: 'Placed',
      total: 'Total',
    },
  },

  insights: {
    title: 'Key Insights',
    description: 'Rule-based checks on these figures and on current stock',
    heldBackPartial: 'Held back until this period finishes',
    heldBack: 'Held back on this period',
    nothingCrossed: 'Nothing in this period crossed a reporting threshold.',
    severity: {
      warning: 'Warning',
      action: 'Action',
      positive: 'Good news',
      opportunity: 'Opportunity',
      data_quality: 'Data quality',
    },
    links: {
      inventory: 'Check inventory',
      customers: 'View customers',
      expenses: 'Review expenses',
      figures: 'Check the figures',
    },
  },

  filters: {
    search: 'Search',
    status: 'Status',
    placed_from: 'Placed from',
    placed_to: 'Placed to',
    is_active: 'Active',
    low_stock: 'Low stock',
    incurred_from: 'Incurred from',
    incurred_to: 'Incurred to',
    expense_category_id: 'Category',
    category_id: 'Category',
    country: 'Country',
    role: 'Role',
    action: 'Action',
    subject_type: 'Subject',
    user_id: 'User',
    from: 'From',
    to: 'To',
    cursor: 'Position',
    sort: 'Sort',
    page: 'Page',
    per_page: 'Rows per page',
  },

  orders: {
    description: 'Every committed sale, and the drafts on their way to becoming one.',
    new: 'New order',
    searchPlaceholder: 'Search by reference…',
    searchLabel: 'Search orders',
    anyStatus: 'Any status',
    columns: {
      order: 'Order',
      customer: 'Customer',
      status: 'Status',
      placed: 'Placed',
      total: 'Total',
    },
    empty: {
      title: 'No orders yet',
      description: 'Orders you create will appear here with their status, dates and totals.',
      action: 'Create the first order',
    },
  },

  catalog: {
    activeState: 'Active state',
    activeOnly: 'Active only',
    inactiveOnly: 'Inactive only',
    stockLevel: 'Stock level',
    anyStockLevel: 'Any stock level',
    lowStockOnly: 'Low stock only',
  },

  customers: {
    description:
      'Order history, lifetime value and growth are computed from orders — they are metrics, not stored columns.',
    searchPlaceholder: 'Search name, email or company…',
    searchLabel: 'Search customers',
    all: 'All customers',
    columns: {
      customer: 'Customer',
      email: 'Email',
      company: 'Company',
      country: 'Country',
      added: 'Added',
    },
    empty: {
      title: 'No customers yet',
      description:
        'Customers let orders be attributed to a buyer, which is what makes growth and retention measurable.',
    },
  },

  products: {
    description:
      'The catalog. Editing a price or cost affects future orders only — past orders keep their own snapshots.',
    searchPlaceholder: 'Search name or SKU…',
    searchLabel: 'Search products',
    all: 'All products',
    columns: {
      category: 'Category',
      price: 'Price',
      cost: 'Cost',
      stock: 'Stock',
    },
    empty: {
      title: 'No products yet',
      description: 'Products supply the price and cost used at the moment of sale.',
    },
  },

  inventory: {
    description:
      'Stock on hand is a cache over an append-only ledger. Every change is recorded with a reason.',
    searchPlaceholder: 'Search product or SKU…',
    searchLabel: 'Search inventory',
    adjust: 'Adjust',
    columns: {
      onHand: 'On hand',
      reorderAt: 'Reorder at',
      lastMovement: 'Last movement',
    },
    empty: {
      title: 'No stock records yet',
      description: 'Every product gets an inventory row when it is created.',
    },
    dialog: {
      title: 'Adjust stock — {product}',
      current: 'Currently {count} on hand.',
      receive: 'Receive stock',
      apply: 'Apply adjustment',
      type: 'Type',
      typeAdjust: 'Correction, damage or loss',
      typeRestock: 'Receiving stock',
      change: 'Change',
      changeHint: 'A signed delta: {remove} removes three units, {add} adds five.',
      reasonCount: 'Stock count correction',
      reasonDamage: 'Damaged',
      reasonLoss: 'Lost',
      quantityReceived: 'Quantity received',
      unitCostHint: "Recorded on the movement. It does not change the product's catalog cost.",
      note: 'Note',
      noteHint:
        'An unexplained stock change is indistinguishable from theft when someone reviews the ledger later.',
      noExpense:
        'Receiving stock does <strong>not</strong> create an expense. Stock cost reaches profit through cost of goods at the point of sale — recording it as an expense too would count it twice.',
    },
  },

  expenses: {
    description:
      'Operating costs only. Stock purchases reach profit through cost of goods at the point of sale — recording them here would count them twice.',
    searchPlaceholder: 'Search description or vendor…',
    searchLabel: 'Search expenses',
    anyCategory: 'Any category',
    columns: {
      incurred: 'Incurred',
      description: 'Description',
      vendor: 'Vendor',
      amount: 'Amount',
    },
    empty: {
      title: 'No expenses recorded',
      description: 'Without expenses, Opsight reports revenue rather than profit.',
    },
  },

  analytics: {
    description:
      'Every figure is computed from source records at the moment you ask. Nothing here is stored.',
    partial: 'This period is still in progress and is being compared against a complete one.',
    trend: 'Trend',
    metric: 'Metric',
    grain: 'Grain',
    automatic: 'Automatic',
    breakDownBy: 'Break down by',
    grains: {
      day: 'Daily',
      week: 'Weekly',
      month: 'Monthly',
    },
    dimensions: {
      product: 'Product',
      category: 'Category',
      customer: 'Customer',
    },
    breakdownTitles: {
      product: 'Net revenue by product',
      category: 'Net revenue by category',
      customer: 'Net revenue by customer',
    },
    breakdownDescription: 'Ranked, with everything outside the top ten grouped as Other',
    help: {
      title: 'How to read these figures',
      revenue:
        'Revenue excludes tax and shipping. Tax is collected for a tax authority; shipping is treated as cost recovery.',
      cost: 'Cost of goods uses the cost recorded <strong>at the moment of sale</strong>, so changing a product’s cost today never moves a past figure.',
      refund:
        'A refund reduces the period the order was <strong>placed</strong> in, not the period the refund was issued.',
      emDash:
        'An em dash means the figure cannot be computed — usually a division by zero. It never means zero.',
      points:
        'Changes between two ratios are shown in percentage <strong>points</strong> (pp), not percentages.',
    },
  },

  activity: {
    description:
      'Append-only. Nothing in this application can edit or delete an entry, and every export of it is itself recorded here.',
    anyAction: 'Any action',
    notSignedIn: 'Not signed in',
    columns: {
      when: 'When',
      action: 'Action',
      who: 'Who',
      subject: 'Subject',
      detail: 'Detail',
    },
    empty: {
      title: 'No matching activity',
      description: 'Nothing has been recorded for these filters.',
    },
    moreFields: 'and {count} more',
    pagerNote:
      'Newest first. Paged by position rather than page number, so no entry can slip between pages as new ones arrive.',
    newer: 'Newer',
    older: 'Older',
    // The noun of an action name: `order` in `order.confirmed`.
    subjects: {
      auth: 'sign-in',
      export: 'export',
      order: 'order',
      orderitem: 'order line',
      product: 'product',
      category: 'category',
      customer: 'customer',
      expense: 'expense',
      expensecategory: 'expense category',
      inventory: 'inventory',
      user: 'user',
      settings: 'settings',
    },
    // The model class recorded as the subject of a row.
    subjectTypes: {
      Order: 'Order',
      OrderItem: 'Order line',
      Product: 'Product',
      Category: 'Category',
      Customer: 'Customer',
      Expense: 'Expense',
      ExpenseCategory: 'Expense category',
      InventoryMovement: 'Stock movement',
      User: 'User',
      BusinessSetting: 'Settings',
    },
    verbs: {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      login: 'login',
      logout: 'logout',
      login_failed: 'login failed',
      lockout: 'lockout',
      generated: 'generated',
      confirmed: 'confirmed',
      fulfilled: 'fulfilled',
      cancelled: 'cancelled',
      refunded: 'refunded',
      activated: 'activated',
      deactivated: 'deactivated',
      role_changed: 'role changed',
      password_changed: 'password changed',
    },
    fields: {
      name: 'name',
      email: 'email',
      role: 'role',
      is_active: 'active',
      locale: 'language',
      numerals: 'digits',
      status: 'status',
      reason: 'reason',
      lines: 'lines',
      amount: 'amount',
      soft_delete: 'recoverable',
      resource: 'file',
      rows: 'rows',
      filters: 'filters',
      sort: 'sort',
      sku: 'SKU',
      price: 'price',
      cost: 'cost',
      quantity: 'quantity',
      quantity_delta: 'change',
      balance_after: 'balance after',
      stock_on_hand: 'on hand',
      reorder_point: 'reorder at',
      unit_cost: 'unit cost',
      unit_price: 'unit price',
      note: 'note',
      notes: 'notes',
      description: 'description',
      vendor: 'vendor',
      company: 'company',
      country: 'country',
      city: 'city',
      phone: 'phone',
      currency: 'currency',
      currency_decimals: 'decimal places',
      timezone: 'timezone',
      fiscal_year_start_month: 'fiscal year start',
      company_name: 'company name',
      default_low_stock_threshold: 'low stock threshold',
      total_amount: 'total',
      subtotal_amount: 'subtotal',
      refunded_amount: 'refunded',
      cancellation_reason: 'cancellation reason',
    },
  },

  roles: {
    owner: 'Owner',
    manager: 'Manager',
    analyst: 'Analyst',
    staff: 'Staff',
  },

  users: {
    description:
      'Accounts are deactivated, never deleted. A deleted user takes their audit trail with them, and every past action becomes unattributable.',
    add: 'Add user',
    create: 'Create user',
    searchPlaceholder: 'Search name or email…',
    searchLabel: 'Search users',
    anyRole: 'Any role',
    you: '(you)',
    roleFor: 'Role for {name}',
    active: 'Active',
    deactivated: 'Deactivated',
    never: 'Never',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    empty: 'No matching users',
    columns: {
      name: 'Name',
      lastSignedIn: 'Last signed in',
    },
    confirm: {
      title: 'Deactivate this account?',
      consequence:
        '{name} will lose access on their next request, even if they are signed in right now, and will not be able to sign in again. Everything they have already done stays on record.',
      consequenceUnnamed:
        'This user will lose access on their next request, even if they are signed in right now, and will not be able to sign in again. Everything they have already done stays on record.',
    },
    passwordHint: 'At least {count} characters. The new user should change it after signing in.',
    confirmPassword: 'Confirm password',
  },

  settings: {
    description:
      'Business configuration, editable at runtime. These are decisions the company makes, not the server it runs on, which is why they are here rather than in a deployment file.',
    readOnly:
      'These values are shown because every screen needs the currency and timezone to render figures correctly. Only an Owner can change them.',
    business: {
      title: 'Business',
      description: 'Identity and money formatting',
    },
    companyName: 'Company name',
    currency: 'Currency',
    currencyHint: 'ISO 4217, e.g. BHD. One currency for the whole installation.',
    decimals: 'Decimal places',
    decimalsHint: 'Three for the Bahraini dinar; two for most currencies.',
    lowStock: 'Low stock threshold',
    lowStockHint: 'Used for any product that does not set its own.',
    periods: {
      title: 'Reporting periods',
      description:
        'These two decide where every period begins and ends. Changing either one leaves every record untouched but moves which month, quarter or year it is counted in, so historical totals will shift.',
      warning:
        'You have changed a field that moves historical figures. Saving will change the totals reported for periods that have already closed. The underlying orders and expenses are not modified.',
    },
    timezone: 'Business timezone',
    fiscalYear: 'Fiscal year starts',
    save: 'Save settings',
    saved: 'Saved. Every figure on screen has been recomputed.',
  },

  orderDetail: {
    walkIn: 'Walk-in — no customer record',
    timeline: 'Timeline',
    placed: 'Placed',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
    reason: 'Reason',
    refunded: 'Refunded',
    refundAmount: 'Refund amount',
    draftNote:
      'This is a draft. It appears in no metric until it is confirmed, and prices are snapshotted at that moment — not now.',
    totals: 'Totals',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    shipping: 'Shipping',
    total: 'Total',
    taxNote:
      'Tax and shipping are excluded from revenue. Tax is collected for a tax authority, and shipping is treated as cost recovery.',
    items: 'Items',
    itemsCaption: 'Items on {reference}',
    columns: {
      sku: 'SKU',
      product: 'Product',
      quantity: 'Qty',
      unitPrice: 'Unit price',
      unitCost: 'Unit cost',
      lineTotal: 'Line total',
    },
  },

  newOrder: {
    description: 'Start a draft, then add items to it.',
    draftDescription: 'Draft {reference} — add items, then confirm.',
    details: 'Order details',
    customer: 'Customer',
    customerHint: 'Leave empty for walk-in trade — new-customer metrics exclude those.',
    walkInOption: 'Walk-in (no customer)',
    notes: 'Notes',
    notesPlaceholder: 'Anything worth recording about this order…',
    start: 'Start draft',
    addItemTitle: 'Add an item',
    chooseProduct: 'Choose a product',
    quantity: 'Quantity',
    addItem: 'Add item',
    priceNote:
      'Prices shown on a draft are indicative. The figures that count are snapshotted from the catalog at the moment you confirm.',
    draftItems: 'Draft items',
    noItems: 'No items yet',
    noItemsDescription: 'An order cannot be confirmed until it has at least one item.',
    remove: 'Remove',
    saveAndView: 'Save and view draft',
  },

  orderActions: {
    confirm: 'Confirm order',
    fulfil: 'Mark fulfilled',
    cancel: 'Cancel order',
    refund: 'Record refund',
    cancelTitle: 'Cancel {reference}?',
    cancelConsequence: {
      one: 'This returns {count} unit to stock and removes {amount} from revenue for the period it was placed in. The order stays on record as cancelled.',
      other:
        'This returns {count} units to stock and removes {amount} from revenue for the period it was placed in. The order stays on record as cancelled.',
    },
    reason: 'Reason',
    reasonPlaceholder: 'Why is this order being cancelled?',
    refundTitle: 'Record a refund for {reference}',
    refundTotal: 'Order total is {amount}.',
    refundAmount: 'Refund amount',
    returnStock: 'Return the goods to stock',
    returnStockHint:
      'Leave this unchecked for damaged goods — restocking them would overstate what is sellable.',
    refundPeriodNote:
      'The refund reduces revenue in the period the order was <strong>placed</strong>, not today.',
  },

  orderStatus: {
    draft: 'Draft',
    confirmed: 'Confirmed',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  },

  pagination: {
    none: 'No records',
    range: '{first}–{last} of {total}',
    rows: 'Rows',
    previous: 'Previous',
    next: 'Next',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    page: '{page} / {pages}',
  },
};

export default en;
