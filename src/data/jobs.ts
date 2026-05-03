import type { Job, ExamCategory, Testimonial, StudyMaterial, FolderStructure } from '@/types';

export const sampleJobs: Job[] = [
  {
    id: '1',
    title: 'UPSC CDS I 2025',
    organization: 'Union Public Service Commission',
    vacancies: 457,
    lastDate: '2025-01-31',
    applyLink: 'https://upsc.gov.in',
    category: 'defense',
    description: 'Combined Defence Services Examination (I) 2025 for admission to Indian Military Academy, Indian Naval Academy, Air Force Academy, and Officers Training Academy.',
    eligibility: 'Graduation from recognized university. Age: 19-24 years.',
    salary: 'Rs. 56,100 - 2,50,000/-',
    location: 'All India',
    postedDate: '2024-12-15',
    status: 'active',
    tags: ['new', 'urgent']
  },
  {
    id: '2',
    title: 'RRB Junior Engineer',
    organization: 'Railway Recruitment Board',
    vacancies: 25000,
    lastDate: '2025-01-15',
    applyLink: 'https://rrbcdg.gov.in',
    category: 'railway',
    description: 'Recruitment for Junior Engineer posts in various railway zones across India.',
    eligibility: 'Diploma/Degree in Engineering. Age: 18-33 years.',
    salary: 'Rs. 35,400 - 1,12,400/-',
    location: 'All India',
    postedDate: '2024-12-20',
    status: 'active',
    tags: ['new']
  },
  {
    id: '3',
    title: 'IBPS PO XIV',
    organization: 'Institute of Banking Personnel Selection',
    vacancies: 4500,
    lastDate: '2024-12-28',
    applyLink: 'https://ibps.in',
    category: 'banking',
    description: 'Probationary Officer recruitment in participating banks.',
    eligibility: 'Graduation in any discipline. Age: 20-30 years.',
    salary: 'Rs. 36,000 - 63,840/-',
    location: 'All India',
    postedDate: '2024-12-10',
    status: 'active',
    tags: ['last3days']
  },
  {
    id: '4',
    title: 'SSC CGL 2025',
    organization: 'Staff Selection Commission',
    vacancies: 15000,
    lastDate: '2025-02-10',
    applyLink: 'https://ssc.nic.in',
    category: 'ssc',
    description: 'Combined Graduate Level Examination for Group B and C posts in various ministries.',
    eligibility: 'Bachelor\'s degree from recognized university. Age: 18-32 years.',
    salary: 'Rs. 25,500 - 1,51,100/-',
    location: 'All India',
    postedDate: '2024-12-22',
    status: 'active',
    tags: ['new']
  },
  {
    id: '5',
    title: 'ISRO Scientist/Engineer',
    organization: 'Indian Space Research Organisation',
    vacancies: 65,
    lastDate: '2025-01-20',
    applyLink: 'https://isro.gov.in',
    category: 'technical',
    description: 'Recruitment of Scientists/Engineers in Electronics, Mechanical, and Computer Science.',
    eligibility: 'B.E./B.Tech with minimum 65% marks. Age: 18-35 years.',
    salary: 'Rs. 56,100 - 1,77,500/-',
    location: 'Bangalore, Ahmedabad, Sriharikota',
    postedDate: '2024-12-18',
    status: 'active',
    tags: ['new', 'urgent']
  },
  {
    id: '6',
    title: 'RBI Grade B 2025',
    organization: 'Reserve Bank of India',
    vacancies: 291,
    lastDate: '2025-02-05',
    applyLink: 'https://rbi.org.in',
    category: 'banking',
    description: 'Officers in Grade B (DR) - General, DEPR, and DSIM.',
    eligibility: 'Graduation with 60% marks. Age: 21-30 years.',
    salary: 'Rs. 55,000 - 85,000/-',
    location: 'All India',
    postedDate: '2024-12-21',
    status: 'active',
    tags: ['new']
  },
  {
    id: '7',
    title: 'NDA I 2025',
    organization: 'Union Public Service Commission',
    vacancies: 406,
    lastDate: '2025-01-07',
    applyLink: 'https://upsc.gov.in',
    category: 'defense',
    description: 'National Defence Academy and Naval Academy Examination (I) 2025.',
    eligibility: '12th Class pass. Age: 16.5-19.5 years.',
    salary: 'Rs. 56,100 - 2,50,000/-',
    location: 'All India',
    postedDate: '2024-12-12',
    status: 'active',
    tags: ['urgent']
  },
  {
    id: '8',
    title: 'CTET January 2025',
    organization: 'Central Board of Secondary Education',
    vacancies: 0,
    lastDate: '2025-01-25',
    applyLink: 'https://ctet.nic.in',
    category: 'teaching',
    description: 'Central Teacher Eligibility Test for primary and upper primary teachers.',
    eligibility: 'Graduation with B.Ed. for Paper II, 12th with D.El.Ed for Paper I.',
    salary: 'N/A',
    location: 'All India',
    postedDate: '2024-12-19',
    status: 'active',
    tags: ['new']
  }
];

export const examCategories: ExamCategory[] = [
  {
    id: 'upsc',
    name: 'UPSC Civil Services',
    nameHi: 'UPSC सिविल सेवा',
    description: 'IAS, IPS, IFS Preparation',
    descriptionHi: 'IAS, IPS, IFS तैयारी',
    icon: 'Building2',
    color: 'from-orange-500 to-red-600',
    jobCount: 45
  },
  {
    id: 'ssc',
    name: 'SSC Exams',
    nameHi: 'SSC परीक्षाएं',
    description: 'CGL, CHSL, MTS, GD',
    descriptionHi: 'CGL, CHSL, MTS, GD',
    icon: 'FileText',
    color: 'from-blue-500 to-cyan-600',
    jobCount: 120
  },
  {
    id: 'banking',
    name: 'Banking Exams',
    nameHi: 'बैंकिंग परीक्षाएं',
    description: 'IBPS, SBI, RBI',
    descriptionHi: 'IBPS, SBI, RBI',
    icon: 'Landmark',
    color: 'from-green-500 to-emerald-600',
    jobCount: 85
  },
  {
    id: 'railway',
    name: 'Railway Exams',
    nameHi: 'रेलवे परीक्षाएं',
    description: 'RRB NTPC, Group D',
    descriptionHi: 'RRB NTPC, ग्रुप D',
    icon: 'Train',
    color: 'from-purple-500 to-violet-600',
    jobCount: 200
  },
  {
    id: 'teaching',
    name: 'Teaching Exams',
    nameHi: 'शिक्षण परीक्षाएं',
    description: 'CTET, TET, PRT, TGT',
    descriptionHi: 'CTET, TET, PRT, TGT',
    icon: 'GraduationCap',
    color: 'from-pink-500 to-rose-600',
    jobCount: 65
  },
  {
    id: 'defense',
    name: 'Defense Exams',
    nameHi: 'रक्षा परीक्षाएं',
    description: 'NDA, CDS, AFCAT',
    descriptionHi: 'NDA, CDS, AFCAT',
    icon: 'Shield',
    color: 'from-amber-500 to-orange-600',
    jobCount: 35
  }
];

export const testimonials: Testimonial[] = [
  {
    id: '1',
    name: 'Rahul Kumar',
    avatar: '/images/avatars/rahul.jpg',
    text: 'Cracked SSC CGL in first attempt! The study materials and mock tests were extremely helpful.',
    textHi: 'पहले प्रयास में SSC CGL क्रैक किया! स्टडी मटेरियल और मॉक टेस्ट बहुत मददगार थे।',
    exam: 'SSC CGL 2024',
    rating: 5
  },
  {
    id: '2',
    name: 'Priya Sharma',
    avatar: '/images/avatars/priya.jpg',
    text: 'Best Hindi study materials available online. Made my UPSC preparation much easier.',
    textHi: 'ऑनलाइन सबसे अच्छे हिंदी स्टडी मटेरियल। UPSC तैयारी बहुत आसान हो गई।',
    exam: 'UPSC CSE 2024',
    rating: 5
  },
  {
    id: '3',
    name: 'Amit Singh',
    avatar: '/images/avatars/amit.jpg',
    text: 'Regular job updates helped me apply on time. Got selected in IBPS PO!',
    textHi: 'नियमित नौकरी अपडेट्स ने समय पर आवेदन करने में मदद की। IBPS PO में सिलेक्ट हुआ!',
    exam: 'IBPS PO 2024',
    rating: 5
  },
  {
    id: '4',
    name: 'Sneha Patel',
    avatar: '/images/avatars/sneha.jpg',
    text: 'The bilingual content is amazing. Can switch between Hindi and English easily.',
    textHi: 'द्विभाषी कंटेंट अद्भुत है। हिंदी और अंग्रेजी में आसानी से स्विच कर सकती हूं।',
    exam: 'RRB NTPC 2024',
    rating: 4
  },
  {
    id: '5',
    name: 'Vikram Rao',
    avatar: '/images/avatars/vikram.jpg',
    text: 'Current affairs section is updated daily. Very useful for all competitive exams.',
    textHi: 'करंट अफेयर्स सेक्शन रोजाना अपडेट होता है। सभी प्रतियोगी परीक्षाओं के लिए बहुत उपयोगी।',
    exam: 'Banking Exams',
    rating: 5
  }
];
export const sampleProducts = [
  {
    id: 'p1',
    name: 'SSC CGL Complete Notes 2026',
    description: 'All-in-one package including Math, Reasoning, English & GK Notes + 50 Mock Tests.',
    price: 499,
    originalPrice: 1999,
    rating: 4.8,
    reviewCount: 1240,
    stock: 100,
    features: ['PDF Notes', 'Previous Year Papers', '50+ Mock Tests', 'Video Solutions']
  },
  {
    id: 'p2',
    name: 'Banking Awareness E-Book',
    description: 'Detailed banking terms, RBI guidelines, and financial awareness for IBPS/SBI PO.',
    price: 199,
    originalPrice: 499,
    rating: 4.5,
    reviewCount: 850,
    stock: 500,
    features: ['Updated Monthly', 'RBI Grade B Ready', 'Printable PDF']
  },
  {
    id: 'p3',
    name: 'Railway NTPC & Group D Kit',
    description: 'Special General Science (Physics, Chem, Bio) and Current Affairs notes.',
    price: 299,
    originalPrice: 999,
    rating: 4.6,
    reviewCount: 2100,
    stock: 200,
    features: ['Science NCERT Summary', 'Formula Charts', '2000+ MCQs']
  },
  {
    id: 'p4',
    name: 'UPSC Prelims CSAT Guide',
    description: 'Master CSAT with shortcut tricks for Math and logical reasoning.',
    price: 699,
    originalPrice: 1499,
    rating: 4.9,
    reviewCount: 560,
    stock: 50,
    features: ['Solved Papers (2015-2025)', 'Video Tricks', 'Practice Sets']
  },
  {
    id: 'p5',
    name: 'English Vocabulary Booster',
    description: '10,000+ Words with meanings, synonyms, antonyms and usage examples.',
    price: 149,
    originalPrice: 399,
    rating: 4.7,
    reviewCount: 3200,
    stock: 999,
    features: ['Root Words Technique', 'Daily Usage', 'Flashcards Format']
  },
  {
    id: 'p6',
    name: 'Current Affairs Yearly 2025',
    description: 'Complete year round-up of National, International, Sports, and Awards news.',
    price: 99,
    originalPrice: 299,
    rating: 4.4,
    reviewCount: 5000,
    stock: 0, // Out of Stock example
    features: ['Month-wise breakdown', 'Top 1000 MCQs', 'Who\'s Who List']
  }
];

export const sampleMaterials: StudyMaterial[] = [
  {
    id: '1',
    title: 'SSC CGL 2024 Tier 1 Question Paper',
    description: 'Previous year question paper with answer key',
    category: 'previous-papers',
    subcategory: 'ssc',
    language: 'both',
    fileUrl: '/materials/ssc-cgl-2024-tier1.pdf',
    fileType: 'PDF',
    fileSize: '2.5 MB',
    downloadCount: 15420,
    examType: 'ssc',
    isPremium: false,
    folderPath: '/SSC/Previous Year Papers/2024',
    createdAt: new Date()
  },
  {
    id: '2',
    title: 'UPSC Prelims 2024 GS Paper 1',
    description: 'General Studies Paper 1 with detailed solutions',
    category: 'previous-papers',
    subcategory: 'upsc',
    language: 'english',
    fileUrl: '/materials/upsc-prelims-2024-gs1.pdf',
    fileType: 'PDF',
    fileSize: '3.2 MB',
    downloadCount: 12350,
    examType: 'upsc',
    isPremium: false,
    folderPath: '/UPSC/Previous Year Papers/2024',
    createdAt: new Date()
  },
  {
    id: '3',
    title: 'Banking Awareness Notes (Hindi)',
    description: 'Complete banking awareness notes in Hindi',
    category: 'notes',
    subcategory: 'banking',
    language: 'hindi',
    fileUrl: '/materials/banking-awareness-hindi.pdf',
    fileType: 'PDF',
    fileSize: '5.8 MB',
    downloadCount: 28900,
    examType: 'banking',
    isPremium: false,
    folderPath: '/Banking/Notes/Hindi',
    createdAt: new Date()
  },
  {
    id: '4',
    title: 'RRB NTPC Mock Test Series 1',
    description: 'Full length mock test for RRB NTPC',
    category: 'mock-tests',
    subcategory: 'railway',
    language: 'both',
    fileUrl: '/materials/rrb-ntpc-mock-1.pdf',
    fileType: 'PDF',
    fileSize: '1.8 MB',
    downloadCount: 18760,
    examType: 'railway',
    isPremium: true,
    price: 49,
    folderPath: '/Railway/Mock Tests/NTPC',
    createdAt: new Date()
  },
  {
    id: '5',
    title: 'Current Affairs December 2024',
    description: 'Monthly current affairs compilation',
    category: 'current-affairs',
    subcategory: 'general',
    language: 'both',
    fileUrl: '/materials/current-affairs-dec-2024.pdf',
    fileType: 'PDF',
    fileSize: '4.1 MB',
    downloadCount: 32100,
    examType: 'all',
    isPremium: false,
    folderPath: '/Current Affairs/2024/December',
    createdAt: new Date()
  },
  {
    id: '6',
    title: 'Quantitative Aptitude Formulas',
    description: 'All important formulas for quantitative aptitude',
    category: 'notes',
    subcategory: 'quant',
    language: 'both',
    fileUrl: '/materials/quant-formulas.pdf',
    fileType: 'PDF',
    fileSize: '1.2 MB',
    downloadCount: 45600,
    examType: 'all',
    isPremium: false,
    folderPath: '/Quantitative Aptitude/Notes',
    createdAt: new Date()
  }
];

export const folderStructure: FolderStructure[] = [
  {
    id: 'ssc',
    name: 'SSC',
    nameHi: 'SSC',
    type: 'folder',
    path: '/SSC',
    children: [
      {
        id: 'ssc-papers',
        name: 'Previous Year Papers',
        nameHi: 'पिछले वर्ष के पेपर',
        type: 'folder',
        parentId: 'ssc',
        path: '/SSC/Previous Year Papers',
        children: [
          {
            id: 'ssc-2024',
            name: '2024',
            nameHi: '2024',
            type: 'folder',
            parentId: 'ssc-papers',
            path: '/SSC/Previous Year Papers/2024',
            children: []
          },
          {
            id: 'ssc-2023',
            name: '2023',
            nameHi: '2023',
            type: 'folder',
            parentId: 'ssc-papers',
            path: '/SSC/Previous Year Papers/2023',
            children: []
          }
        ]
      },
      {
        id: 'ssc-notes',
        name: 'Notes',
        nameHi: 'नोट्स',
        type: 'folder',
        parentId: 'ssc',
        path: '/SSC/Notes',
        children: [
          {
            id: 'ssc-english',
            name: 'English',
            nameHi: 'अंग्रेजी',
            type: 'folder',
            parentId: 'ssc-notes',
            path: '/SSC/Notes/English',
            children: []
          },
          {
            id: 'ssc-hindi',
            name: 'Hindi',
            nameHi: 'हिंदी',
            type: 'folder',
            parentId: 'ssc-notes',
            path: '/SSC/Notes/Hindi',
            children: []
          }
        ]
      }
    ]
  },
  {
    id: 'upsc',
    name: 'UPSC',
    nameHi: 'UPSC',
    type: 'folder',
    path: '/UPSC',
    children: [
      {
        id: 'upsc-papers',
        name: 'Previous Year Papers',
        nameHi: 'पिछले वर्ष के पेपर',
        type: 'folder',
        parentId: 'upsc',
        path: '/UPSC/Previous Year Papers',
        children: []
      },
      {
        id: 'upsc-ncert',
        name: 'NCERT Notes',
        nameHi: 'NCERT नोट्स',
        type: 'folder',
        parentId: 'upsc',
        path: '/UPSC/NCERT Notes',
        children: []
      }
    ]
  },
  {
    id: 'banking',
    name: 'Banking',
    nameHi: 'बैंकिंग',
    type: 'folder',
    path: '/Banking',
    children: [
      {
        id: 'banking-ibps',
        name: 'IBPS',
        nameHi: 'IBPS',
        type: 'folder',
        parentId: 'banking',
        path: '/Banking/IBPS',
        children: []
      },
      {
        id: 'banking-sbi',
        name: 'SBI',
        nameHi: 'SBI',
        type: 'folder',
        parentId: 'banking',
        path: '/Banking/SBI',
        children: []
      }
    ]
  },
  {
    id: 'railway',
    name: 'Railway',
    nameHi: 'रेलवे',
    type: 'folder',
    path: '/Railway',
    children: [
      {
        id: 'railway-ntpc',
        name: 'NTPC',
        nameHi: 'NTPC',
        type: 'folder',
        parentId: 'railway',
        path: '/Railway/NTPC',
        children: []
      },
      {
        id: 'railway-groupd',
        name: 'Group D',
        nameHi: 'ग्रुप D',
        type: 'folder',
        parentId: 'railway',
        path: '/Railway/Group D',
        children: []
      }
    ]
  },
  {
    id: 'current-affairs',
    name: 'Current Affairs',
    nameHi: 'करंट अफेयर्स',
    type: 'folder',
    path: '/Current Affairs',
    children: [
      {
        id: 'ca-2024',
        name: '2024',
        nameHi: '2024',
        type: 'folder',
        parentId: 'current-affairs',
        path: '/Current Affairs/2024',
        children: []
      },
      {
        id: 'ca-2025',
        name: '2025',
        nameHi: '2025',
        type: 'folder',
        parentId: 'current-affairs',
        path: '/Current Affairs/2025',
        children: []
      }
    ]
  }
];

export const jobTickerItems = [
  'ISRO Recruitment 2025 - 65 Posts',
  'RBI Grade B 2025 - 291 Posts',
  'SSC CGL 2025 - 15000+ Posts',
  'RRB Junior Engineer - 25000+ Posts',
  'UPSC CDS I 2025 - 457 Posts',
  'IBPS PO XIV - 4500+ Posts',
  'NDA I 2025 - 406 Posts',
  'CTET January 2025 - Apply Now'
];
