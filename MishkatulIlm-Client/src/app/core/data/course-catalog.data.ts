export type TopicCardAccent = 'green' | 'gold';
export type TopicCardIcon = 'book' | 'arabic' | 'chat';

export interface CourseListItem {
  label?: string;
  text: string;
}

export interface CourseSection {
  title: string;
  intro?: string;
  items?: CourseListItem[];
  ordered?: boolean;
}

export interface CourseCatalogEntry {
  slug: string;
  title: string;
  titleArabic: string;
  overlayTitle?: string;
  tagline?: string;
  summary: string;
  details: string;
  image: string;
  accent: TopicCardAccent;
  icon: TopicCardIcon;
  sections: CourseSection[];
}

export const COURSE_CATALOG: CourseCatalogEntry[] = [
  {
    slug: 'quran-tajweed',
    title: "Qur'an Recitation with Tajweed",
    titleArabic: 'قراءة القرآن مع التجويد',
    overlayTitle: "Qur'an Recitation with Tajweed",
    tagline: 'Master the Divine Art of Correct Recitation',
    summary:
      "This foundational course is meticulously designed to guide learners of all levels in the proper and beautiful recitation of the Holy Qur'an. Whether you are a complete beginner just starting your journey with the sacred text or an advanced student refining your tajweed, lessons are tailored to your pace.",
    details:
      'Start from the Arabic alphabet or strengthen existing reading skills with one-on-one guidance. Lessons focus on correct letter articulation (makhraj), smooth flow between words, and building confidence reciting from the mushaf at your own pace.',
    image: '/offers/quran-tajweed.png',
    accent: 'green',
    icon: 'book',
    sections: [
      {
        title: '',
        intro:
          'Tajweed is not just an elective; it is the foundation of correct Quranic engagement. These rules preserve the pronunciation and characteristics of every letter, ensuring you recite just as the Prophet Muhammad (PBUH) recited. It changes your relationship with the text from simple reading to rhythmic, spiritually sound recitation.',
      },
      {
        title: 'What is Casual and What You Must Learn (Course Scope)',
        intro:
          'This course balances a supportive, encouraging atmosphere with precise technical instruction. Learning the Quran must be gentle, but it must be correct.',
        items: [
          {
            label: 'Casual',
            text: 'We establish a relaxed pace; mistakes are part of learning and are corrected gently. Your individual journey and connection are prioritized.',
          },
          {
            label: 'Necessary / Technical',
            text: 'You must commit to rigorous practice in articulation points (Makharij) and the rules of extension, pause, and merging. This requires consistent application and feedback.',
          },
        ],
      },
      {
        title: 'What You Are Going To Learn (Core Curriculum)',
        intro:
          'We will progress through a structured curriculum that moves beyond basic reading into advanced articulation.',
        items: [
          {
            label: 'Foundation First',
            text: 'Master the Makharij (correct exit points for each letter in the mouth and throat).',
          },
          {
            label: 'Rules of Sifaat',
            text: 'Learn the intrinsic characteristics of letters (e.g., softness vs. strength).',
          },
          {
            label: 'The Big Rules',
            text: 'Understand and apply standard dynamic markings, including the rules of Noon Sakinah and Tanween (Merging, Substitution, Hiding, Clarity).',
          },
          {
            label: 'Applying Elongation',
            text: 'Perfect the rules of Madd (prolongation of vowels), essential for rhythm.',
          },
          {
            label: 'Practical Stop & Start',
            text: 'Know exactly where it is permissible and proper to pause (Waqf) and restart (Ibtida’).',
          },
        ],
      },
      {
        title: 'What You’ll Be Able To Do (Immediate Application)',
        intro: 'By applying these points, you will immediately transform your personal daily recitation.',
        items: [
          {
            text: 'Recite the Quran with technical accuracy, applying every dynamic marking clearly.',
          },
          {
            text: 'Correct common errors you previously overlooked.',
          },
          {
            text: 'Identify Tajweed rules in any random Quranic passage.',
          },
          {
            text: 'Follow color-coded (dynamic marking) Mushafs independently.',
          },
        ],
      },
      {
        title: 'Who is This Course Designed For?',
        intro:
          'This course is structured to be accessible to anyone ready to refine their speech, regardless of their current level.',
        items: [
          {
            label: 'Beginners (Level 1)',
            text: 'Adults or older children who know the alphabet but read very slowly or with many errors.',
          },
          {
            label: 'Intermediates (Level 2)',
            text: 'Students who can read basic Quranic text but struggle with specific dynamic markings like Idgham or Ikhfa.',
          },
          {
            label: 'Improvers',
            text: 'Any reader seeking to apply the precise, traditional rules of elongation and articulation for a beautiful, accurate recitation.',
          },
        ],
      },
      {
        title: 'Qualities of Your Tutors',
        intro:
          'Learning Tajweed requires an instructor who is not only knowledgeable but has a chain of authorization.',
        items: [
          {
            label: 'Ijazah Holders',
            text: 'All of our Tajweed instructors hold verified Ijazahs (certifications) specifically for teaching Quranic Recitation.',
          },
          {
            label: 'Patient & Precise',
            text: 'They possess the rare blend of patience necessary for gentle correction and the analytical precision required to diagnose articulation errors by ear.',
          },
          {
            label: 'Pedagogical Experts',
            text: 'Our instructors are trained to explain ancient rules clearly using modern terminology and helpful visual aids.',
          },
        ],
      },
      {
        title: 'Who Should Enroll',
        intro:
          'This course is perfect for students looking for structured mastery rather than abstract knowledge.',
        items: [
          {
            label: 'Students Seeking Perfection',
            text: 'Individuals who want to recite as beautifully and accurately as the classic reciters.',
          },
          {
            label: 'Parents',
            text: 'Mothers and fathers who want to ensure they model and teach correct pronunciation to their children.',
          },
          {
            label: 'New Muslims',
            text: 'Individuals who are beginning their journey with the Quran and need a solid foundation before committing to extensive memorization.',
          },
        ],
      },
      {
        title: 'Learning Outcomes (Key Competencies You Will Master)',
        intro: 'By the end of this comprehensive course, you will have the ability to:',
        ordered: true,
        items: [
          { text: 'Properly articulate every Arabic letter from its correct exit point.' },
          { text: 'Accurately apply all forms of Madd (elongation).' },
          { text: 'Execute the precise rules of Noon Sakinah and Meem Sakinah.' },
          { text: 'Master the rules of Tanween and Merging (Idgham).' },
          { text: 'Recite with consistent rhythm, respecting the rules of pause and stops.' },
          { text: 'Explain the reason behind every Tajweed rule you apply.' },
          { text: 'Analyze verses and explain which dynamic markings they contain.' },
          {
            text: 'Read from standard and colored Mushafs with full confidence and beautiful flow.',
          },
        ],
      },
    ],
  },
  {
    slug: 'quran-memorization',
    title: 'Quran Memorization (Hifz)',
    titleArabic: 'حفظ القرآن',
    overlayTitle: 'Quran Memorization',
    tagline: 'Commit the Divine Words to Heart',
    summary:
      "Commit portions of the Qur'an to memory with guided revision, correction, and a steady plan. Work through hifz at your own pace with a dedicated tutor who supports memorization, revision (muraja'ah), and long-term retention.",
    details:
      "Work through hifz at your own pace with a dedicated tutor who supports memorization, revision (muraja'ah), and retention. Lessons include clear targets, regular review of previous portions, and guidance on proper recitation as you memorize.",
    image: '/offers/quran-memorization.png',
    accent: 'gold',
    icon: 'arabic',
    sections: [
      {
        title: '',
        intro:
          'Memorizing the Quran is a profound spiritual journey and a lifelong commitment. This course provides the structure, discipline, and personalized guidance necessary to preserve the text of Allah in your heart, adhering to traditional methods that build retention and mastery.',
      },
      {
        title: 'What You Are Going To Learn (Core Curriculum)',
        intro:
          'We move beyond rote repetition to build a structured foundation for complete recall.',
        items: [
          {
            label: 'Custom Hifz Plan',
            text: 'Develop a personalized memorization schedule (daily ayats, surahs) based on your individual capacity and goals.',
          },
          {
            label: 'Sabak (New Lesson)',
            text: 'Master techniques for quickly memorizing new verses with correct Tajweed from the first day.',
          },
          {
            label: 'Recent Revision (Muraja’ah)',
            text: 'Systematically review the recently memorized sections to solidify them.',
          },
          {
            label: 'Cumulative Revision',
            text: 'Implement a long-term strategy for reviewing previously completed Juz or large sections of the Quran.',
          },
          {
            label: 'Retention Strategies',
            text: 'Learn specific memory techniques (e.g., visual association, auditory reinforcement) used by successful Huffaz.',
          },
        ],
      },
      {
        title: 'What You’ll Be Able To Do (Immediate Application)',
        intro:
          'By applying these points, you will see immediate progress in your spiritual connection and capability.',
        items: [
          { text: 'Recite entire Surahs or Juz purely from memory.' },
          { text: 'Incorporate newly memorized verses directly into your daily Salah.' },
          { text: 'Maintain a sustainable daily review routine.' },
          {
            text: 'Confidently recite your Manzil before your teacher without major hesitations.',
          },
        ],
      },
      {
        title: 'Who is This Course Designed For?',
        intro:
          'This program is structured for students of all ages ready to commit time and effort to internalizing the text.',
        items: [
          {
            label: 'Children (Ages 7+)',
            text: 'Young students with strong basic reading and some prior memorization.',
          },
          {
            label: 'Teens & Adults',
            text: 'Individuals seeking a structured environment to complete their Hifz after a gap, or those starting later in life.',
          },
          {
            label: 'Committed Improvers',
            text: 'Huffaz who have forgotten sections and need a comprehensive revision plan to regain their certification.',
          },
        ],
      },
      {
        title: 'Qualities of Your Tutors',
        intro: 'Hifz requires more than an instructor; it requires a guide.',
        items: [
          {
            label: 'Huffaz al-Quran',
            text: 'All of our Hifz instructors have completed the full memorization of the Quran and hold a Hifz Ijazah.',
          },
          {
            label: 'Chain of Sanad',
            text: 'Most instructors possess a chain of narration (Sanad) linking their memorization directly back to the Prophet (PBUH).',
          },
          {
            label: 'Patient Mentors',
            text: 'They understand the mental and spiritual challenges of Hifz and provide patience and motivational support to help you overcome plateaus.',
          },
        ],
      },
      {
        title: 'Who Should Enroll',
        intro: 'This course is best suited for individuals ready for a deep commitment.',
        items: [
          {
            label: 'Aspiring Huffaz',
            text: 'Anyone with a sincere intention to memorize the entire Quran or significant portions of it.',
          },
          {
            label: 'Parents',
            text: 'Families looking for a disciplined, structured path for their children to begin and complete Hifz.',
          },
          {
            label: 'Students of Knowledge',
            text: 'Individuals seeking a spiritual foundation to enhance their understanding and application of Islamic sciences.',
          },
        ],
      },
      {
        title: 'Learning Outcomes (Key Competencies You Will Master)',
        intro: 'By the end of this comprehensive course, you will have the ability to:',
        ordered: true,
        items: [
          {
            text: 'Memorize a specified number of daily verses or surahs according to your custom plan.',
          },
          {
            text: 'Recite your memorized portions with consistent accuracy and correct Tajweed.',
          },
          {
            text: 'Establish and maintain a personalized, lifelong Sabak, Sabki, and Manzil routine.',
          },
          { text: 'Consistently retain large portions of the Quran with minimal errors.' },
          { text: 'Recite long passages in daily Salah (or Tarawih) from memory.' },
          {
            text: 'Identify the connection and flow of verses within a Surah to aid recall.',
          },
          {
            text: 'Pass rigorous cumulative review assessments (e.g., reciting an entire Juz before an examiner).',
          },
          {
            text: 'Formulate a sustainable post-completion review strategy to preserve your Hifz.',
          },
        ],
      },
    ],
  },
  {
    slug: 'classical-arabic',
    title: 'Classical Arabic Language',
    titleArabic: 'اللغة العربية الفصحى والمعاصرة',
    overlayTitle: 'Classical Arabic Language',
    tagline: 'Unlock the Key to Understanding and Proper Conversation',
    summary:
      "Build a strong foundation in classical Arabic through structured study of grammar (nahw), morphology (sarf), and rhetoric (balagha). Ideal for students who want to understand the Qur'an more deeply or engage with Islamic texts in their original language.",
    details:
      'Develop reading, writing, and conversational Arabic through tailored lessons in grammar (nahw), morphology (sarf), and vocabulary. Ideal for students who want to understand the Quran more deeply or communicate in everyday Arabic.',
    image: '/offers/classical-arabic.png',
    accent: 'green',
    icon: 'chat',
    sections: [
      {
        title: '',
        intro:
          'Learning Classical Arabic (Fusha) is not just memorizing vocabulary; it is acquiring the analytical tools, the logical frameworks that allow you to build correct sentences, understand intricate text, and engage in meaningful, grammatically sound conversations. This course builds your foundation in the primary sciences of the language.',
      },
      {
        title: 'What You Are Going To Learn (Core Curriculum)',
        intro:
          'Our curriculum targets the critical sciences that differentiate simple reading from true linguistic comprehension.',
        items: [
          {
            label: 'Nahw (النحْوُ — Grammar)',
            text: 'Master the rules of sentence structure, grammatical case markings (الْإِعْرَابُ), and the roles words play (agent, object, description). Understand why endings change.',
          },
          {
            label: 'Sarf (الصَّرْفُ — Morphology)',
            text: 'Study word formation and verb patterns. Learn to derive nouns, adjectives, and verbs from root letters, and how to properly conjugate verbs across all persons and tenses.',
          },
          {
            label: 'Al Balagha (الْبَلَاغَةُ — Eloquence / Rhetoric)',
            text: 'Move beyond meaning to beauty. Learn the classical arts of effective communication, metaphor, clarity, and the elegant structures that make the Arabic of the Quran unparalleled.',
          },
          {
            label: 'Practical Conversation & Understanding',
            text: 'Apply grammar (Nahw) and morphology (Sarf) immediately in structured dialogues, ensuring your speech is both accurate and elegant.',
          },
        ],
      },
      {
        title: 'What You’ll Be Able To Do (Immediate Application)',
        intro:
          'By applying these core principles, you will gain immediate, practical linguistic skills.',
        items: [
          {
            text: 'Construct grammatically flawless sentences in written and spoken Classical Arabic.',
          },
          {
            text: 'Conjugate verbs and derive complex vocabulary accurately using Sarf patterns.',
          },
          {
            text: 'Deconstruct simple verses and Hadith to understand their grammatical logic.',
          },
          {
            text: 'Engage in structured, polite conversations about daily topics using Fusha.',
          },
        ],
      },
      {
        title: 'Who is This Course Designed For?',
        intro:
          'This program is structured for students ready for a serious study of Arabic structure.',
        items: [
          {
            label: 'Complete Beginners',
            text: 'Adults and motivated teenagers who want to build a foundation in the logical structure (Nahw) rather than just rote phrases.',
          },
          {
            label: 'Improvers / Intermediate',
            text: 'Students who already have basic vocabulary but find themselves guessing case markings or struggling with verb forms.',
          },
          {
            label: 'Serious Quranic Students',
            text: 'Individuals intending to pursue deep Tafsir study who require a complete command of classical linguistic sciences.',
          },
        ],
      },
      {
        title: 'Qualities of Your Tutors',
        intro: 'Linguistic instruction requires precision and a deep lineage of knowledge.',
        items: [
          {
            label: 'Masters of Fusha',
            text: 'All of our instructors are fluent in Fusha and possess specialization in classical grammar and rhetoric (Nahw, Sarf, Balagha).',
          },
          {
            label: 'Patient & Analytical',
            text: 'They possess the rare ability to simplify complex rules while precisely identifying and explaining a student’s articulation or structural errors.',
          },
          {
            label: 'Contextual Educators',
            text: 'They are trained to teach ancient grammar through a lens of modern pedagogical clarity, connecting technical rules to real-world understanding and conversation.',
          },
        ],
      },
      {
        title: 'Who Should Enroll',
        intro:
          'This course is best suited for students looking for structured mastery rather than abstract phrase learning.',
        items: [
          {
            label: 'The Foundation Builder',
            text: "Students who value understanding 'why' and desire logical clarity in their learning journey.",
          },
          {
            label: 'Future Translators / Imams',
            text: 'Anyone pursuing advanced Islamic studies (Sharia, Hadith, or Tafsir).',
          },
          {
            label: 'Aspirational Speakers',
            text: 'Individuals committed to communicating with elegance and precision in the classical dialect.',
          },
        ],
      },
      {
        title: 'Learning Outcomes (Key Competencies You Will Master)',
        intro: 'By the end of this comprehensive course, you will have the ability to:',
        ordered: true,
        items: [
          {
            text: 'Identify and properly apply essential case markings (الْإِعْرَابُ) in both speech and writing.',
          },
          {
            text: 'Deconstruct and analyze sentence structures (الجملة الاسمية والفعلية) according to Nahw rules.',
          },
          {
            text: 'Conjugate any regular or irregular Arabic verb accurately across all tenses and persons using Sarf patterns.',
          },
          { text: 'Derive and define various nouns and adjectives from a given three-letter root.' },
          {
            text: 'Recognize basic rhetorical devices (Metaphor, Simile, Clarity) utilized in classical and modern Fusha.',
          },
          { text: 'Formulate polite and complex paragraphs on various topics with accurate grammar.' },
          {
            text: 'Understand the underlying grammatical logic behind specific Hadith and Quranic passages.',
          },
          {
            text: 'Engage in structured conversations using clear, precise Classical Arabic with confidence.',
          },
        ],
      },
    ],
  },
  {
    slug: 'quran-mastery',
    title: "Qur'an Recitation Mastery",
    titleArabic: 'تلاوة القرآن الكريم',
    overlayTitle: "Qur'an Recitation Mastery",
    tagline: 'The Journey Beyond Proficiency to Artistry and Precision',
    summary:
      'Advance from fluency to mastery with focused coaching on voice, rhythm, breath control, and precision. For students who already read comfortably and want to refine their delivery with a teacher who helps polish tone and consistency.',
    details:
      'For students who already read comfortably and want to refine their recitation further. Work on tone, rhythm, breath control, and precision with a teacher who helps you polish your delivery and consistency.',
    image: '/offers/quran-mastery.png',
    accent: 'gold',
    icon: 'arabic',
    sections: [
      {
        title: '',
        intro:
          'Mastery is not just reciting correctly; it is embodying the rhythm, the emotional weight, and the technical perfection of traditional Quranic recitation. This summarized course targets the highest levels of performance, transitioning students from proficient readers to exemplary reciters worthy of leading congregations or teaching.',
      },
      {
        title: 'Course Scope and Student Profile',
        intro:
          'This program is intensive, focused on refinement and professional polish.',
        items: [
          {
            label: 'Designed For',
            text: 'Certified readers (those holding an Ijazah in Tajweed) looking to perfect their tone, breath control, and intricate dynamic execution.',
          },
          {
            label: 'Intended Audience',
            text: 'Aspiring Imams, public reciters, and serious students seeking the highest recognized levels of technical competence and spiritual delivery.',
          },
        ],
      },
      {
        title: 'What You Are Going To Learn (Advanced Focus)',
        intro:
          'Our condensed curriculum targets the technical mastery and emotional intelligence of recitation.',
        items: [
          {
            label: 'Advanced Dynamic Execution',
            text: 'Perfect intricate Tajweed rules (e.g., precise degrees of Ghunnah, subtle articulation characteristics).',
          },
          {
            label: 'Breath and Vocal Control',
            text: 'Learn techniques used by leading Huffaz to maintain consistent rhythm and power during long passages.',
          },
          {
            label: 'Maqamat (Melodic Modes)',
            text: 'Explore traditional melodic structures responsibly applied to recitation, enhancing emotional impact without distorting Tajweed.',
          },
          {
            label: 'The Art of Pause and Start (Advanced)',
            text: 'Master complex scenarios for stopping and starting (Waqf & Ibtida) based on context and meaning.',
          },
        ],
      },
      {
        title: 'Learning Outcomes (Key Competencies at Mastery Level)',
        intro: 'By the end of this intensive course, you will possess the ability to:',
        ordered: true,
        items: [
          {
            text: 'Recite the Quran with professional, technically flawless Tajweed from memory or script.',
          },
          {
            text: 'Maintain sophisticated control over breathing and vocal delivery for extended recitation periods.',
          },
          {
            text: 'Utilize Maqamat effectively to convey the diverse meanings and emotions of different Surahs.',
          },
          {
            text: 'Exemplify precise, confident application of all Waqf and Ibtida rules in complex contexts.',
          },
          {
            text: 'Receive an advanced validation (often an upper-level Sanad or certification) recognized in professional Quranic circles.',
          },
          {
            text: 'Lead congregations (Salah/Tarawih) or deliver public recitations with authority and grace.',
          },
        ],
      },
    ],
  },
  {
    slug: 'islamic-studies',
    title: 'Islamic Studies Comprehensive Course',
    titleArabic: 'دورة الدراسات الإسلامية الشاملة',
    overlayTitle: 'Islamic Studies Comprehensive Course',
    summary:
      'Explore core beliefs, worship, and life guidance through structured lessons and discussion. Cover essential topics such as aqeedah, fiqh basics, seerah, and daily Islamic practice adapted to your background and learning goals.',
    details:
      'Cover essential topics such as aqeedah, fiqh basics, seerah, and daily Islamic practice through structured lessons and discussion. Content is adapted to your background, age, and learning goals.',
    image: '/offers/islamic-studies.png',
    accent: 'green',
    icon: 'book',
    sections: [
      {
        title: '',
        intro:
          'This is not a general overview; it is a direct immersion into the specialized fields of Islamic knowledge. Guided by expert scholars, you will analyze the primary sources, understand methodologies, and apply classic principles to modern life. This comprehensive course targets students serious about establishing a strong, authenticated foundation in the faith.',
      },
      {
        title: 'What You Are Going To Learn (Core Curriculum)',
        intro:
          'Our specialized curriculum directly targets the pillars of classical Islamic thought.',
        items: [
          {
            label: 'Hadith (الْحَدِيثُ — Prophetic Narrations)',
            text: "Study authenticated collections (e.g., Nawawi's 40, Bukhari selections), analyzing the Matn (text) for prophetic guidance, legal rulings, and spiritual purification.",
          },
          {
            label: 'Mustolahu l-Hadith (مُصْطَلَحُ الْحَدِيثِ — Hadith Terminology)',
            text: "Master the methodology used by scholars to verify Hadith. Learn classifications (Sahih, Hassan, Da'if), the criteria for narrators (Rijal), and how to assess authenticity.",
          },
          {
            label: 'Al-Fiqh (الْفِقْهُ — Jurisprudence)',
            text: "Study foundational legal principles derived from the Quran and Sunnah. Focus on practical application (Fard 'Ayn and Kifayah) and foundational understanding of Ibadaat (worship) or Mu'amalat (transactions) using classical methodologies.",
          },
          {
            label: 'Tafseer (التَّفْسِيرُ — Quranic Exegesis)',
            text: 'Move beyond translation into deep commentary. Learn classical exegesis methodologies (Usul at-Tafseer), linguistic analysis, legal derivation from verses, and historical context (Asbab al-Nuzul).',
          },
          {
            label: 'Taarikh (التَّارِيخُ — Islamic History)',
            text: 'Study pivotal eras: Prophetic Seerah, the Rightly Guided Caliphs, and significant periods, analyzing leadership, societal shifts, and the preservation of Islamic knowledge.',
          },
          {
            label: 'Al Aadaab & Aqeedah (Spiritual Adab and Creedal Studies)',
            text: 'Incorporate the study of personal conduct and foundational Islamic creed for a balanced, practical implementation of knowledge.',
          },
        ],
      },
      {
        title: 'What You’ll Be Able To Do (Immediate Application)',
        intro:
          'By applying these core principles, you will gain authenticated understanding and analysis skills.',
        items: [
          {
            text: 'Understand and explain complex Islamic rulings based on their actual evidence and methodology.',
          },
          {
            text: 'Critically analyze the authenticity claims of common Hadith narrations using scholarly tools.',
          },
          {
            text: 'Extract practical guidance for your personal daily life directly from prophetic texts.',
          },
          {
            text: 'Identify classical scholarly approaches and avoid common misinterpretations of Quranic verses.',
          },
        ],
      },
      {
        title: 'Who is This Course Designed For?',
        intro:
          'This program is structured for students ready for deep study rather than general surveys.',
        items: [
          {
            label: 'Committed Improvers',
            text: 'Students who have completed basic Fard-Ayn and seek comprehensive knowledge from authenticated sources.',
          },
          {
            label: 'Serious Students of Knowledge',
            text: 'Individuals intending to pursue formal Islamic scholarship, Sharia studies, or academic Islamic research.',
          },
          {
            label: 'Educators & Parents',
            text: 'Imams, teachers, and parents seeking to improve their personal understanding and answer complex questions from the next generation.',
          },
        ],
      },
      {
        title: 'Qualities of Your Tutors',
        intro:
          'Islamic instruction at this level requires precision and a deep lineage of knowledge.',
        items: [
          {
            label: 'Authentically Authorized Scholars',
            text: 'All instructors hold verified specialized degrees (Ijazah or academic specialization) specifically in the subjects they teach (e.g., Hadith or Fiqh).',
          },
          {
            label: 'Chain of Sanad (For Hadith / Fiqh)',
            text: 'Many instructors possess verified lineages linking their knowledge back to the classic compilers and the Prophet (PBUH).',
          },
          {
            label: 'Pedagogical Experts',
            text: 'Trained to teach classical methodologies clearly, bridging ancient Arabic texts with modern pedagogical clarity.',
          },
        ],
      },
      {
        title: 'Who Should Enroll',
        intro:
          "This course is best suited for individuals ready for a structured study of the faith's analytical pillars.",
        items: [
          {
            label: 'The Foundation Builder',
            text: 'Students who value authenticated knowledge and seek logical, evidence-based clarity in their faith.',
          },
          {
            label: 'Future Imams / Scholars',
            text: 'Anyone pursuing formal authorization in foundational Islamic sciences.',
          },
          {
            label: 'Critical Thinkers',
            text: 'Individuals looking to move beyond surface-level information and understand Islamic reasoning and methodology.',
          },
        ],
      },
      {
        title: 'Learning Outcomes (Key Competencies You Will Master)',
        intro: 'By the end of this comprehensive course, you will have the ability to:',
        ordered: true,
        items: [
          {
            text: 'Identify legal rulings and spiritual principles directly from foundational Hadith collections.',
          },
          {
            text: 'Explain the academic reason behind common rulings in Islamic Fiqh using classical Usul.',
          },
          {
            text: 'Critically assess the authenticity of simple Hadith chains using Mustolahu principles.',
          },
          {
            text: 'Apply established Tafseer methodologies to analyze and explain specific Quranic verses within their context.',
          },
          {
            text: 'Formulate evidence-based answers to contemporary ethical and legal questions using Islamic legal logic.',
          },
          {
            text: 'Explain the preservation methodologies used by scholars to protect Islamic texts and narrations.',
          },
          {
            text: 'Summarize significant leadership lessons and societal impacts from major periods in Taarikh.',
          },
          {
            text: 'Consistently implement purified Adab (conduct) derived from classical prophetic texts in your personal and social interaction.',
          },
        ],
      },
    ],
  },
  {
    slug: 'islamic-inheritance',
    title: "Islamic Inheritance Law (Al-Fara'id)",
    titleArabic: 'تعليم الفرائض وتطبيقاتها',
    overlayTitle: "Islamic Inheritance Law (Al-Fara'id)",
    tagline: 'Master the Precise Science of Estate Division',
    summary:
      'Learn the rules of Islamic inheritance and estate division with clear examples and practical application. Understand the principles of faraid with step-by-step explanations so you can study the topic with clarity and confidence.',
    details:
      'Understand the principles of faraid (Islamic inheritance) with step-by-step explanations and practical examples. Learn how shares are calculated and applied so you can study the topic with clarity and confidence.',
    image: '/offers/islamic-inheritance.png',
    accent: 'gold',
    icon: 'book',
    sections: [
      {
        title: '',
        intro:
          'The Islamic Law of Inheritance (Ilmul-Fara\'id) is a highly specialized legal and mathematical science praised by the Prophet Muhammad (PBUH) as "half of all knowledge." This course offers a direct, mathematically rigorous, and legally exhaustive deep-dive into the divine system of estate distribution. You will move past general theories to master the exact fractional calculations, legal blockages, and complex scenarios mandated by the Quran and Sunnah.',
      },
      {
        title: 'What You Are Going To Learn (Core Curriculum)',
        intro:
          "Our direct curriculum strips away ambiguity, focusing entirely on the structural mechanics of Al-Fara'id (علم المواريث).",
        items: [
          {
            label: 'Foundations of the Estate',
            text: "Study the four sequential rights associated with a deceased person's property (funeral expenses, debts, valid wills/bequests, and inheritance distribution).",
          },
          {
            label: 'The Primary Heirs & Prescribed Quotas (As-hab al-Furud)',
            text: 'Exhaustive analysis of the 12 primary heirs specified in the Quran and their exact fractional shares — Nisf (النصف, 1/2), Rub\'u (الربع, 1/4), Thumnu (الثمن, 1/8), Thuluthaan (الثلثان, 2/3), Thuluth (الثلث, 1/3), and Sudus (السدس, 1/6) — based on changing familial variables.',
          },
          {
            label: 'Residuary Inheritance',
            text: 'Master the rules governing those who inherit the remaining wealth after primary quotas are satisfied, mapping out the complex hierarchy of male paternal relatives.',
          },
          {
            label: 'The Law of Impediments & Exclusion (Al-Hajb)',
            text: 'Learn the absolute and partial rules of blockage—how the presence of a closer relative legally reduces or entirely excludes a more distant relative from inheriting.',
          },
          {
            label: 'Advanced Calculation Algorithms',
            text: 'Master complex mathematical adjustments essential to classical jurisprudence, including Al-Awal (proportional reduction when fractional shares exceed the total estate) and At-Tashih (resolving fractional shares into whole numbers for multiple individuals).',
          },
        ],
      },
      {
        title: 'What You’ll Be Able To Do (Immediate Application)',
        intro:
          'By the end of this course, you will possess a rare and highly sought-after professional skillset.',
        items: [
          {
            text: 'Analyze a complex family tree and instantly isolate who is legally eligible to inherit and who is excluded.',
          },
          {
            text: "Construct a comprehensive mathematical breakdown of any deceased person's estate into precise whole-number shares.",
          },
          {
            text: 'Draft, review, and audit an Islamic Will (Al Wasiyyah) to ensure it strictly respects the Thuluth (1/3) legal boundary and does not infringe upon mandatory heirs.',
          },
          {
            text: 'Provide accurate, evidence-backed consulting to families, mosques, or legal professionals regarding estate disputes.',
          },
        ],
      },
      {
        title: 'Who is This Course Designed For?',
        intro:
          'This advanced legal module is meticulously crafted for professionals, leaders, and analytical minds.',
        items: [
          {
            label: 'Islamic Legal Practitioners & Scholars',
            text: 'Imams, legal consultants, and students of Shariah looking to master this essential field of public jurisprudence.',
          },
          {
            label: 'Finance & Estate Planning Professionals',
            text: 'Muslim lawyers, accountants, and wealth managers who want to offer valid, legally binding Islamic estate structures to clients.',
          },
          {
            label: 'Community Leaders & Executors',
            text: 'Individuals frequently called upon by their communities or families to mediate, calculate, or oversee the distribution of familial wealth.',
          },
        ],
      },
      {
        title: 'Qualities of Your Tutors',
        intro:
          'A science this precise demands an instructor with exceptional mathematical clarity and elite scriptural credentials.',
        items: [
          {
            label: 'Specialized Legal Muftis',
            text: "Your instructors hold specific, advanced certifications (Ijazat) in Ilm al-Fara'id and Islamic financial jurisprudence.",
          },
          {
            label: 'Dual-Expertise Educators',
            text: 'They possess a unique blend of classical jurisprudential mastery and modern academic teaching skills, utilizing digital whiteboards and matrices to map out logic clearly.',
          },
          {
            label: 'Experienced Advisors',
            text: 'They have real-world experience auditing, calculating, and resolving complex, multi-million dollar estate distributions across global jurisdictions.',
          },
        ],
      },
      {
        title: 'Who Should Enroll',
        intro:
          'This course is tailored for individuals who demand absolute mastery over abstract theory.',
        items: [
          {
            label: 'The Detail-Oriented Mind',
            text: 'Students who thrive on logic, structure, mathematical problem-solving, and clear-cut legal boundaries.',
          },
          {
            label: 'Asset Owners & Heads of Household',
            text: "Anyone looking to properly structure their own assets to strictly fulfill divine commands while protecting their family's financial future.",
          },
          {
            label: 'Advanced Students of Knowledge',
            text: 'Those looking to fill a critical gap in their Islamic studies curriculum with a heavy, deeply practical specialized skill.',
          },
        ],
      },
      {
        title: 'Learning Outcomes (8 Key Competencies You Will Master)',
        intro: 'By the end of this rigorous course, you will have the verified ability to:',
        ordered: true,
        items: [
          {
            text: 'Differentiate and execute the legal priority of expenses, debts, wills, and inheritances upon an estate.',
          },
          {
            text: 'Instantly determine the exact fractional scriptural shares for any combination of surviving spouses, parents, and children.',
          },
          {
            text: 'Apply the legal conditions required for distant kindred (Dhawuu al-Arham) to inherit in the absence of primary heirs.',
          },
          {
            text: 'Accurately execute the rules of total and partial exclusion (Al-Hajb) across intricate family configurations.',
          },
          {
            text: 'Solve complex mathematical imbalances using the classical doctrines of Al-Awal (fractional overflow) and Ar-Radd (fractional surplus).',
          },
          {
            text: 'Utilize modern digital spreadsheets alongside classical matrices to calculate multi-generational inheritance cases (Al-Munasakhat).',
          },
          {
            text: 'Verify the absolute parameters of a valid Islamic Will (Al Wasiyyah) and calculate its distribution within the legal third limit.',
          },
          {
            text: 'Formulate clear, legally sound, and indisputable inheritance breakdown reports complete with textual evidences from the Quran and Sunnah.',
          },
        ],
      },
    ],
  },
];

export function getCourseBySlug(slug: string): CourseCatalogEntry | undefined {
  return COURSE_CATALOG.find((course) => course.slug === slug);
}
