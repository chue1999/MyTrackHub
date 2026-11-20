/**
 * Every function of the MyTPlus app, grouped into features, with a plain
 * name for each API it calls. Keys are the last part of the API path, or
 * "parent/last" when the last part alone is ambiguous (e.g. "tplusqueue/add").
 *
 * To add a new app function: put its API under the right feature here.
 */
export interface Feature {
  key: string
  label: string
  icon: string
  apis: Record<string, string>
}

export const FEATURES: Feature[] = [
  {
    key: 'account',
    label: 'Login & account',
    icon: 'mdi-account-key-outline',
    apis: {
      Login: 'Log in',
      Register: 'Register account',
      RegisterConfirm: 'Confirm registration (OTP)',
      ForgetPassword: 'Forgot password',
      ForgetPasswordConfirm: 'Reset password',
      ForgetPasswordConfirmOTP: 'Confirm password reset (OTP)',
      ChangePassword: 'Change password',
      ChangePasswordConfirm: 'Confirm password change',
      DeleteAccount: 'Delete account',
      CheckKYCAndSimStatus: 'Check SIM / KYC status',
      CheckKYCAndSimStatusByToken: 'Check SIM / KYC status',
      CheckBiometrics: 'Check fingerprint / Face ID login',
      QueryCustomerInfo: 'Load profile & balance',
    },
  },
  {
    key: 'topup',
    label: 'Top-up',
    icon: 'mdi-cellphone-arrow-down',
    apis: {
      CardRifillForPrepaid: 'Top up with card',
      RefillByMMoney: 'Top up with MMoney',
      QueryLatestRefill: 'Load latest top-ups',
      QueryLogsRefill: 'Top-up history',
    },
  },
  {
    key: 'transfer',
    label: 'Transfer balance',
    icon: 'mdi-bank-transfer',
    apis: {
      TransferConfirmOtp: 'Request transfer OTP',
      TransferBalance: 'Transfer balance',
      QueryTransferHistoryLog: 'Transfer history',
    },
  },
  {
    key: 'package',
    label: 'Packages',
    icon: 'mdi-package-variant',
    apis: {
      ListPackage: 'List packages',
      PackageUssdData: 'Load data packages',
      GetPackageDuration: 'Package durations',
      InquiryPackage: 'Check my packages & data',
      RegisterPackage: 'Buy package',
      RegisterPackageByMMonney: 'Buy package (MMoney)',
      QueryRegisterPackageHistory: 'Package purchase history',
    },
  },
  {
    key: 'roaming',
    label: 'Roaming',
    icon: 'mdi-airplane',
    apis: {
      QueryCountryCode: 'List roaming countries',
      QueryPackageIR: 'List roaming packages',
      RegisterPackageIR: 'Buy roaming package',
      TurnOnIR: 'Turn roaming on',
      TurnOffIR: 'Turn roaming off',
    },
  },
  {
    key: 'bill',
    label: 'Bill payment',
    icon: 'mdi-file-document-outline',
    apis: {
      PostpayPayment: 'Pay postpaid bill',
      QueryLogsPostpaidPayment: 'Bill payment history',
      postpaidInfo: 'Look up postpaid bill',
      'tpluspayment/CheckTotal': 'Check amount to pay',
      'tpluspayment/Confirm': 'Confirm payment',
      PaymentStatus: 'Check payment status',
      GetAllImage: 'Load payment channels',
      Costmoney: 'Check service cost',
    },
  },
  {
    key: 'mmoney',
    label: 'MMoney / bank cash-out',
    icon: 'mdi-cash-fast',
    apis: {
      requestcashoutservice: 'Request MMoney OTP',
      confirmcashoutservice: 'Confirm MMoney payment',
      getdetailforbank: 'Look up MMoney account',
      CheckSimRegister: 'Check SIM registration',
      cashOutMMoney: 'Pay with MMoney',
      CashOutMMoney: 'Pay with MMoney',
    },
  },
  {
    key: 'sim',
    label: 'Order SIM',
    icon: 'mdi-sim-outline',
    apis: {
      QuerySimcardLists: 'List SIM numbers',
      SearchSimcard: 'Search SIM numbers',
      BookingSimCard: 'Order SIM card',
      BookSimCardByMMonney: 'Order SIM card (MMoney)',
      QueryBookingLogs: 'SIM order history',
    },
  },
  {
    key: 'borrow',
    label: 'Borrow data / airtime',
    icon: 'mdi-hand-coin-outline',
    apis: {
      DataBorrowing: 'Borrow data',
      AirtimeBorrowing: 'Borrow airtime',
      QueryBorrow: 'Borrowing info',
    },
  },
  {
    key: 'leavesim',
    label: 'Leave SIM (rental)',
    icon: 'mdi-sim-off-outline',
    apis: {
      getRentalPackage: 'List rental packages',
      rentalServices: 'Rent / keep number',
      historyRental: 'Rental history',
    },
  },
  {
    key: 'points',
    label: 'Points & premium gifts',
    icon: 'mdi-star-circle-outline',
    apis: {
      QueryGiff: 'Load points & gifts',
      UsagePoint: 'Use points for data',
      QueryHistoryPointUsage: 'Points history',
      GetAllPremium: 'List premium gifts',
      CreateRedeemPremium: 'Redeem premium gift',
      createRedeemPremium: 'Redeem premium gift',
      HistoryRedeemPremium: 'Premium redeem history',
    },
  },
  {
    key: 'luckydraw',
    label: 'Lucky wheel & random box',
    icon: 'mdi-ferris-wheel',
    apis: {
      GetLuckySpinerInfo: 'Open lucky wheel',
      GameRandom: 'Spin the wheel',
      spin: 'Spin the wheel',
      QueryGameHistory: 'Lucky wheel history',
      RegisterPackageBySpinerWheelGame: 'Claim lucky wheel prize',
      CheckStatusGame: 'Check game status',
      CheckValidGameUserProfile: 'Check game profile',
      RandomBox: 'Open random box',
      AddPackageRandomBox: 'Claim random box prize',
      QueryGameHistoryRandomBox: 'Random box history',
    },
  },
  {
    key: 'football',
    label: 'Football prediction',
    icon: 'mdi-soccer',
    apis: {
      GetAllMatches: 'List matches',
      GetAllMatchesGroupByDate: 'List matches',
      CreatePredict: 'Make a prediction',
      GetMatchByUserId: 'My predictions',
      QueryHistoryPredictByKikoffId: 'Prediction results',
      QueryHistoryPredictionByUserId: 'Prediction history',
      dortmundGetAllMatchesGroupByDate: 'Dortmund: list matches',
      dortmundCreatePrediction: 'Dortmund: make a prediction',
      dortmundGetMatchByUserId: 'Dortmund: my predictions',
      dortmundQuerHistoryPredictionByKikoffId: 'Dortmund: prediction results',
      dortmundQueryHistoryPredictionByUserId: 'Dortmund: prediction history',
    },
  },
  {
    key: 'books',
    label: 'E-books',
    icon: 'mdi-book-open-variant',
    apis: {
      QueryBook: 'List books',
      QueryBookByType: 'Books by category',
      QueryBookTypes: 'Book categories',
      QueryCurrentBook: 'Latest books',
      QueryCurrentBookType: 'Latest books by category',
      QueryTopSelling: 'Best-selling books',
      SearchBook: 'Search books',
      QueryMyBook: 'My books',
      BookPayment: 'Buy book',
      BookHistoryPayment: 'Book purchase history',
      BookHistoryPaymentDetail: 'Book purchase details',
    },
  },
  {
    key: 'video',
    label: 'Edutainment videos',
    icon: 'mdi-play-circle-outline',
    apis: {
      TopVideo: 'Top videos',
      GetShortVideo: 'Short videos',
      GetCatoryVideo: 'Video categories',
      GetVideoByCategory: 'Videos by category',
      GetVideodetail: 'Open video',
      getVideo: 'Watch video',
      VideoStreaming: 'Watch video',
      AddVideoView: 'Count video view',
      ListVideoPackages: 'Video packages',
      ListVideoPackagePayment: 'Video package purchases',
      AddVideoPackagePayments: 'Buy video package',
    },
  },
  {
    key: 'queue',
    label: 'Book a queue',
    icon: 'mdi-account-clock-outline',
    apis: {
      'tplusqueue/add': 'Book a queue',
      'queue/add': 'Book a queue',
      findallbranch: 'List branches',
      findbranchbyprovince: 'Branches in province',
      queuebranch: 'Branch queue',
      queuehistory: 'My queue tickets',
      remainqueue: 'Queue position',
      QueryBranch: 'List branches',
    },
  },
  {
    key: 'chat',
    label: 'Chat & help',
    icon: 'mdi-chat-processing-outline',
    apis: {
      CheckUserChatProfile: 'Check chat profile',
      checkValidChatUserProfile: 'Check chat profile',
      checkValidRooms: 'Open chat rooms',
      getTplusChatChannels: 'List chat channels',
      getChatChannelInfoByRoomIdForUser: 'Open chat',
      getChatMessages: 'Load messages',
      getChatMessagesByRoomId: 'Load messages',
      getMessage: 'Load messages',
      getMessageList: 'Load conversations',
      'chatbot/query': 'Ask the chatbot',
      stream: 'Ask FoxAI assistant',
    },
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'mdi-bell-outline',
    apis: {
      initDevice: 'Register device for notifications',
      checkSubscriptionToTopics: 'Subscribe to notifications',
      getAllNotRead: 'Unread notifications',
    },
  },
  {
    key: 'home',
    label: 'Home & news',
    icon: 'mdi-home-outline',
    apis: {
      Posters: 'Load home banners',
      GetAllPost: 'Load news feed',
      GetAllPostType: 'Load news categories',
      GetLatestPost: 'Load latest news',
    },
  },
]

export const OTHER_FEATURE: Omit<Feature, 'apis'> = { key: 'other', label: 'Other', icon: 'mdi-dots-horizontal-circle-outline' }

// endpoint key → { feature, label }
const INDEX = new Map<string, { feature: Feature; label: string }>()
for (const f of FEATURES) for (const [k, label] of Object.entries(f.apis)) INDEX.set(k, { feature: f, label })

/** "POST /tplusqueue/add" → { feature: Book a queue, label: "Book a queue" } */
export function lookupApi(name: string) {
  const path = name.includes(' ') ? name.split(' ')[1]! : name
  const segs = path.split('/').filter((s) => s && !s.startsWith(':'))
  const last = segs[segs.length - 1] ?? ''
  const parent = segs[segs.length - 2] ?? ''
  return INDEX.get(`${parent}/${last}`) ?? INDEX.get(last) ?? null
}

export function featureOf(e: { type: string; name: string }) {
  if (e.type !== 'api') return null
  return lookupApi(e.name)?.feature ?? null
}

export const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<string, Feature>
