/* eslint-disable */
import { Link } from 'react-router-dom';
import { Layers, Briefcase, GraduationCap, BookOpen, ClipboardList, Trophy, FileText, Sparkles, ShieldCheck } from 'lucide-react';

interface ExamHubProps {
  exam: string;
  className?: string;
}

const examHubMap: Record<string, { icon: any; color: string; links: Array<{ label: string; url: string; icon: any }> }> = {
  'SSC GD': {
    icon: Briefcase,
    color: 'bg-blue-100 text-blue-600',
    links: [
      { label: 'SSC GD Recruitment', url: '/govt-jobs?exam=SSC GD&type=recruitment', icon: Briefcase },
      { label: 'SSC GD Syllabus', url: '/govt-jobs?exam=SSC GD&type=syllabus', icon: BookOpen },
      { label: 'SSC GD Mock Tests', url: '/test?exam=SSC GD', icon: ClipboardList },
      { label: 'SSC GD Study Material', url: '/free-study-material?exam=SSC GD', icon: GraduationCap },
      { label: 'SSC GD Admit Card', url: '/govt-jobs?exam=SSC GD&type=admit-card', icon: FileText },
      { label: 'SSC GD Result', url: '/govt-jobs?exam=SSC GD&type=result', icon: Trophy },
    ]
  },
  'SSC CGL': {
    icon: Briefcase,
    color: 'bg-purple-100 text-purple-600',
    links: [
      { label: 'SSC CGL Recruitment 2026', url: '/govt-jobs?exam=SSC CGL', icon: Briefcase },
      { label: 'SSC CGL Syllabus', url: '/govt-jobs?exam=SSC CGL&type=syllabus', icon: BookOpen },
      { label: 'SSC CGL Mock Tests', url: '/test?exam=SSC CGL', icon: ClipboardList },
      { label: 'SSC CGL Previous Year', url: '/test?exam=SSC CGL&type=previous', icon: GraduationCap },
    ]
  },
  'SSC': {
    icon: Briefcase,
    color: 'bg-blue-100 text-blue-600',
    links: [
      { label: 'SSC Recruitment', url: '/govt-jobs?exam=SSC', icon: Briefcase },
      { label: 'SSC Mock Tests', url: '/test?exam=SSC', icon: ClipboardList },
      { label: 'SSC Study Material', url: '/free-study-material?exam=SSC', icon: GraduationCap },
      { label: 'Latest SSC Updates', url: '/govt-jobs?exam=SSC&type=updates', icon: Sparkles },
    ]
  },
  'RAILWAY': {
    icon: Layers,
    color: 'bg-orange-100 text-orange-600',
    links: [
      { label: 'Railway Jobs', url: '/govt-jobs?exam=Railway', icon: Briefcase },
      { label: 'RRB Group D Syllabus', url: '/govt-jobs?exam=RRB Group D&type=syllabus', icon: BookOpen },
      { label: 'RRB NTPC Mock Tests', url: '/test?exam=RRB NTPC', icon: ClipboardList },
      { label: 'Railway Study Material', url: '/free-study-material?exam=Railway', icon: GraduationCap },
    ]
  },
  'BANKING': {
    icon: Briefcase,
    color: 'bg-emerald-100 text-emerald-700',
    links: [
      { label: 'Banking Jobs', url: '/govt-jobs?exam=Banking', icon: Briefcase },
      { label: 'Banking Mock Tests', url: '/test?exam=Banking', icon: ClipboardList },
      { label: 'Banking Study Material', url: '/free-study-material?exam=Banking', icon: GraduationCap },
      { label: 'Latest Banking Updates', url: '/govt-jobs?exam=Banking&type=updates', icon: Sparkles },
    ]
  },
  'POLICE': {
    icon: ShieldCheck,
    color: 'bg-rose-100 text-rose-700',
    links: [
      { label: 'Police Jobs', url: '/govt-jobs?exam=Police', icon: Briefcase },
      { label: 'Police Mock Tests', url: '/test?exam=Police', icon: ClipboardList },
      { label: 'Police Study Material', url: '/free-study-material?exam=Police', icon: GraduationCap },
      { label: 'Latest Police Updates', url: '/govt-jobs?exam=Police&type=updates', icon: Sparkles },
    ]
  },
  'UPSC': {
    icon: GraduationCap,
    color: 'bg-indigo-100 text-indigo-700',
    links: [
      { label: 'UPSC Jobs', url: '/govt-jobs?exam=UPSC', icon: Briefcase },
      { label: 'UPSC Mock Tests', url: '/test?exam=UPSC', icon: ClipboardList },
      { label: 'UPSC Study Material', url: '/free-study-material?exam=UPSC', icon: BookOpen },
      { label: 'Latest UPSC Updates', url: '/govt-jobs?exam=UPSC&type=updates', icon: Sparkles },
    ]
  },
  'TEACHING': {
    icon: BookOpen,
    color: 'bg-amber-100 text-amber-700',
    links: [
      { label: 'Teaching Jobs', url: '/govt-jobs?exam=Teaching', icon: Briefcase },
      { label: 'Teaching Mock Tests', url: '/test?exam=Teaching', icon: ClipboardList },
      { label: 'Teaching Study Material', url: '/free-study-material?exam=Teaching', icon: GraduationCap },
      { label: 'Latest Teaching Updates', url: '/govt-jobs?exam=Teaching&type=updates', icon: Sparkles },
    ]
  }
};

const defaultHub = {
  icon: Layers,
  color: 'bg-gray-100 text-gray-600',
  links: [
    { label: 'Government Jobs', url: '/govt-jobs', icon: Briefcase },
    { label: 'Mock Tests', url: '/test', icon: ClipboardList },
    { label: 'Study Material', url: '/free-study-material', icon: BookOpen },
    { label: 'Latest Updates', url: '/govt-jobs', icon: Sparkles },
  ]
};

export function resolveExamHub(exam: unknown) {
  const normalizedExam = String(exam || '').trim().toUpperCase();

  // Match specific exams before broader families (e.g. SSC CGL before SSC).
  for (const [key, value] of Object.entries(examHubMap)) {
    if (normalizedExam && normalizedExam.includes(key)) {
      return { hub: value, matchedExam: key };
    }
  }

  if (/BANK|IBPS|SBI/.test(normalizedExam)) return { hub: examHubMap.BANKING, matchedExam: 'BANKING' };
  if (/POLICE/.test(normalizedExam)) return { hub: examHubMap.POLICE, matchedExam: 'POLICE' };
  if (/UPSC|NDA|CDS/.test(normalizedExam)) return { hub: examHubMap.UPSC, matchedExam: 'UPSC' };
  if (/TEACH|CTET|NET|KVS/.test(normalizedExam)) return { hub: examHubMap.TEACHING, matchedExam: 'TEACHING' };

  // Unknown/missing exam families should render the generic hub, never crash the page.
  return { hub: defaultHub, matchedExam: 'General' };
}

const ExamHubNavigation = ({ exam, className = '' }: ExamHubProps) => {
  const { hub = defaultHub, matchedExam = 'General' } = resolveExamHub(exam);

  return (
    <div className={`bg-white border rounded-2xl p-5 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 rounded-xl ${hub.color}`}>
          <hub.icon size={18} />
        </div>
        <div>
          <h3 className="font-black text-sm text-gray-800">{matchedExam} Hub</h3>
          <p className="text-[11px] text-gray-500 font-bold">Explore all {matchedExam} content</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {hub.links.map((link, idx) => (
          <Link
            key={idx}
            to={link.url}
            className="flex items-center gap-2 p-2.5 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-xl text-xs font-bold text-gray-700 hover:text-blue-700 transition-all group"
          >
            <link.icon size={14} className="shrink-0 text-gray-400 group-hover:text-blue-600" />
            <span className="line-clamp-1">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ExamHubNavigation;
