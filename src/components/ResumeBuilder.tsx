import { useState, useEffect } from 'react';
import { Download, Sparkles, Plus, Trash2, ChevronLeft, CheckCircle, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface ResumeData {
    personalInfo: {
        name: string;
        email: string;
        phone: string;
        location: string;
        linkedin?: string;
        portfolio?: string;
    };
    summary: string;
    experience: {
        id: string;
        company: string;
        role: string;
        duration: string;
        description: string;
    }[];
    education: {
        id: string;
        institution: string;
        degree: string;
        duration: string;
    }[];
    skills: string[];
    projects: {
        id: string;
        title: string;
        description: string;
        link?: string;
    }[];
    awards: string[];
    certifications: string[];
    languages: string[];
}

interface Props {
    analysis: any;
    onBack: () => void;
    enhanceWithAI: (section: string, currentContent: string, suggestions?: string[]) => Promise<string>;
}

export default function ResumeBuilder({ analysis, onBack, enhanceWithAI }: Props) {
    const [resumeData, setResumeData] = useState<ResumeData>({
        personalInfo: {
            name: '',
            email: '',
            phone: '',
            location: '',
        },
        summary: '',
        experience: [],
        education: [],
        skills: [],
        projects: [],
        awards: [],
        certifications: [],
        languages: []
    });

    const [isEnhancing, setIsEnhancing] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [template, setTemplate] = useState<'classic' | 'modern' | 'professional' | 'executive'>('classic');

    const validateFields = () => {
        const newErrors: Record<string, string> = {};
        if (!resumeData.personalInfo.name.trim()) newErrors.name = 'Full Name is required';
        if (!resumeData.personalInfo.email.trim()) newErrors.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resumeData.personalInfo.email)) newErrors.email = 'Invalid email format';
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    useEffect(() => {
        if (analysis) {
            const sections = analysis.resumeSections || {};
            const pInfo = analysis.personalInfo || sections.personalInfo || {};

            setResumeData(prev => ({
                ...prev,
                personalInfo: {
                    ...prev.personalInfo,
                    name: pInfo.name || prev.personalInfo.name,
                    email: pInfo.email || prev.personalInfo.email,
                    phone: pInfo.phone || prev.personalInfo.phone,
                    location: pInfo.location || prev.personalInfo.location,
                    linkedin: pInfo.linkedin || prev.personalInfo.linkedin,
                    portfolio: pInfo.portfolio || prev.personalInfo.portfolio,
                },
                summary: sections.summary?.content || (typeof sections.summary === 'string' ? sections.summary : '') || prev.summary,
                experience: sections.experience?.items ? sections.experience.items.map((item: any, idx: number) => ({
                    id: `exp-${idx}-${Date.now()}`,
                    company: item.company || item.organization || 'Organization',
                    role: item.role || item.title || item.position || 'Role',
                    duration: item.duration || item.dates || item.time || 'Dates',
                    description: item.content || item.description || item.achievements || ''
                })) : (sections.experience?.content || sections.experience?.description ? [{
                    id: 'init-exp',
                    company: sections.experience?.company || sections.experience?.organization || 'Current/Latest Company',
                    role: sections.experience?.role || sections.experience?.title || 'Job Title',
                    duration: sections.experience?.duration || 'Jan 2020 - Present',
                    description: sections.experience.content || sections.experience.description
                }] : prev.experience),
                education: sections.education?.items ? sections.education.items.map((item: any, idx: number) => ({
                    id: `edu-${idx}-${Date.now()}`,
                    institution: item.institution || item.school || item.university || 'Institution',
                    degree: item.degree || item.major || item.certification || 'Degree',
                    duration: item.duration || item.dates || item.year || 'Dates'
                })) : (sections.education?.content || sections.education?.institution ? [{
                    id: 'init-edu',
                    institution: sections.education?.institution || sections.education?.school || 'University Name',
                    degree: sections.education?.degree || sections.education?.major || 'Degree Name',
                    duration: sections.education?.duration || '2016 - 2020'
                }] : prev.education),
                skills: sections.skills?.content ? (
                    typeof sections.skills.content === 'string' 
                        ? sections.skills.content.split(',').map((s: string) => s.trim()) 
                        : Array.isArray(sections.skills.content) 
                            ? sections.skills.content 
                            : prev.skills
                ) : (Array.isArray(sections.skills) ? sections.skills : prev.skills),
                projects: sections.projects?.items ? sections.projects.items.map((item: any, idx: number) => ({
                    id: `proj-${idx}-${Date.now()}`,
                    title: item.title || item.name || 'Project',
                    description: item.content || item.description || ''
                })) : (sections.projects?.content || sections.projects?.description ? [{
                    id: 'init-proj',
                    title: sections.projects?.title || sections.projects?.name || 'Key Project',
                    description: sections.projects.content || sections.projects.description
                }] : prev.projects),
                awards: Array.isArray(sections.awards?.items) ? sections.awards.items : (Array.isArray(sections.awards) ? sections.awards : prev.awards),
                certifications: Array.isArray(sections.certifications?.items) ? sections.certifications.items : (Array.isArray(sections.certifications) ? sections.certifications : prev.certifications),
                languages: Array.isArray(sections.languages?.items) ? sections.languages.items : (Array.isArray(sections.languages) ? sections.languages : prev.languages),
            }));
        }
    }, [analysis]);

    const handleApplyAllInsights = async () => {
        setIsEnhancing('all');
        try {
            // Enhance summary
            const newSummary = await enhanceWithAI('summary', resumeData.summary, analysis?.resumeSections?.summary?.suggestions || []);
            
            // Enhance all experiences
            const newExperience = await Promise.all(resumeData.experience.map(async exp => ({
                ...exp,
                description: await enhanceWithAI(`experience`, exp.description, analysis?.resumeSections?.experience?.suggestions || [])
            })));

            // Enhance all projects
            const newProjects = await Promise.all(resumeData.projects.map(async proj => ({
                ...proj,
                description: await enhanceWithAI(`projects`, proj.description, analysis?.resumeSections?.projects?.suggestions || [])
            })));

            // Enhance skills
            const newSkillsStr = await enhanceWithAI('skills', resumeData.skills.join(', '), analysis?.resumeSections?.skills?.suggestions || []);
            const newSkills = newSkillsStr.split(',').map(s => s.trim()).filter(s => s !== '');

            // Enhance awards
            const newAwardsStr = await enhanceWithAI('awards', resumeData.awards.join(', '), analysis?.resumeSections?.awards?.suggestions || []);
            const newAwards = newAwardsStr.split(',').map(s => s.trim()).filter(s => s !== '');

            // Enhance certifications
            const newCertificationsStr = await enhanceWithAI('certifications', resumeData.certifications.join(', '), analysis?.resumeSections?.certifications?.suggestions || []);
            const newCertifications = newCertificationsStr.split(',').map(s => s.trim()).filter(s => s !== '');

            // Enhance languages
            const newLanguagesStr = await enhanceWithAI('languages', resumeData.languages.join(', '), analysis?.resumeSections?.languages?.suggestions || []);
            const newLanguages = newLanguagesStr.split(',').map(s => s.trim()).filter(s => s !== '');

            setResumeData(prev => ({
                ...prev,
                summary: newSummary,
                experience: newExperience,
                projects: newProjects,
                skills: newSkills.length > 0 ? newSkills : prev.skills,
                awards: newAwards.length > 0 ? newAwards : prev.awards,
                certifications: newCertifications.length > 0 ? newCertifications : prev.certifications,
                languages: newLanguages.length > 0 ? newLanguages : prev.languages
            }));
        } catch (e) {
            console.error("Bulk enhancement failed", e);
        } finally {
            setIsEnhancing(null);
        }
    };

    const handleEnhance = async (section: string) => {
        if (!validateFields()) return;
        setIsEnhancing(section);
        try {
            let content = '';
            let sectionKey = section;
            let suggestions: string[] = [];

            if (section === 'summary') {
                content = resumeData.summary;
                suggestions = analysis?.resumeSections?.summary?.suggestions || [];
            } else if (section === 'skills') {
                content = resumeData.skills.join(', ');
                suggestions = analysis?.resumeSections?.skills?.suggestions || [];
            } else if (section.startsWith('exp-')) {
                const id = section.replace('exp-', '');
                content = resumeData.experience.find(e => e.id === id)?.description || '';
                sectionKey = 'experience';
                suggestions = analysis?.resumeSections?.experience?.suggestions || [];
            } else if (section.startsWith('proj-')) {
                const id = section.replace('proj-', '');
                content = resumeData.projects.find(p => p.id === id)?.description || '';
                sectionKey = 'projects';
                suggestions = analysis?.resumeSections?.projects?.suggestions || [];
            } else if (section === 'awards') {
                content = resumeData.awards.join(', ');
                suggestions = analysis?.resumeSections?.awards?.suggestions || [];
            } else if (section === 'certifications') {
                content = resumeData.certifications.join(', ');
                suggestions = analysis?.resumeSections?.certifications?.suggestions || [];
            } else if (section === 'languages') {
                content = resumeData.languages.join(', ');
                suggestions = analysis?.resumeSections?.languages?.suggestions || [];
            }

            const enhanced = await enhanceWithAI(sectionKey, content, suggestions);
            
            if (section === 'summary') {
                setResumeData(prev => ({ ...prev, summary: enhanced }));
            } else if (section === 'skills') {
                const newSkills = enhanced.split(',').map(s => s.trim()).filter(s => s !== '');
                setResumeData(prev => ({ ...prev, skills: newSkills }));
            } else if (section === 'awards') {
                const newAwards = enhanced.split(',').map(s => s.trim()).filter(s => s !== '');
                setResumeData(prev => ({ ...prev, awards: newAwards }));
            } else if (section === 'certifications') {
                const newCertifications = enhanced.split(',').map(s => s.trim()).filter(s => s !== '');
                setResumeData(prev => ({ ...prev, certifications: newCertifications }));
            } else if (section === 'languages') {
                const newLanguages = enhanced.split(',').map(s => s.trim()).filter(s => s !== '');
                setResumeData(prev => ({ ...prev, languages: newLanguages }));
            } else if (section.startsWith('exp-')) {
                const id = section.replace('exp-', '');
                setResumeData(prev => ({
                    ...prev,
                    experience: prev.experience.map(e => e.id === id ? { ...e, description: enhanced } : e)
                }));
            } else if (section.startsWith('proj-')) {
                const id = section.replace('proj-', '');
                setResumeData(prev => ({
                    ...prev,
                    projects: prev.projects.map(p => p.id === id ? { ...p, description: enhanced } : p)
                }));
            }
        } catch (e) {
            console.error("Enhancement failed", e);
        } finally {
            setIsEnhancing(null);
        }
    };

    const downloadPDF = async () => {
        const element = document.getElementById('resume-preview');
        if (!element) return;

        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${resumeData.personalInfo.name || 'Resume'}_ATS.pdf`);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8 w-full max-w-7xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Editor Sidebar */}
            <div className="w-full lg:w-1/2 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                            <ChevronLeft size={24} />
                        </button>
                        <h2 className="text-2xl font-bold text-slate-900">Resume Enhancer</h2>
                    </div>
                    {analysis && (
                        <button 
                            onClick={handleApplyAllInsights}
                            disabled={isEnhancing === 'all'}
                            className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-purple-100 hover:bg-purple-700 transition-all disabled:opacity-50"
                        >
                            {isEnhancing === 'all' ? <Sparkles className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                            Smart Optimize All
                        </button>
                    )}
                </div>

                    {analysis?.selectabilityAudit && (
                        <div className="bg-blue-900/5 p-4 rounded-2xl border border-blue-900/10 mb-6">
                            <h4 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-2">
                                <CheckCircle size={14} /> 100% Selectability Checklist
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div className={`flex items-center gap-2 text-xs font-medium ${resumeData.personalInfo.linkedin ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    <div className={`w-3 h-3 rounded-full border ${resumeData.personalInfo.linkedin ? 'bg-emerald-500 border-emerald-600' : 'border-slate-300'}`} />
                                    LinkedIn Profile
                                </div>
                                <div className={`flex items-center gap-2 text-xs font-medium ${analysis.selectabilityAudit.hasQuantifiedImpact ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    <div className={`w-3 h-3 rounded-full border ${analysis.selectabilityAudit.hasQuantifiedImpact ? 'bg-emerald-500 border-emerald-600' : 'border-slate-300'}`} />
                                    Metrics Included
                                </div>
                                <div className={`flex items-center gap-2 text-xs font-medium ${analysis.selectabilityAudit.hasActionVerbs ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    <div className={`w-3 h-3 rounded-full border ${analysis.selectabilityAudit.hasActionVerbs ? 'bg-emerald-500 border-emerald-600' : 'border-slate-300'}`} />
                                    Action Verbs
                                </div>
                                <div className={`flex items-center gap-2 text-xs font-medium ${resumeData.summary ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    <div className={`w-3 h-3 rounded-full border ${resumeData.summary ? 'bg-emerald-500 border-emerald-600' : 'border-slate-300'}`} />
                                    Professional Summary
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Personal Info */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-semibold mb-4 text-slate-800">Personal Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <input 
                                placeholder="Full Name *" 
                                className={`p-2 border rounded-lg text-sm w-full transition-colors ${errors.name ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:ring-2 focus:ring-blue-500'}`}
                                value={resumeData.personalInfo.name}
                                onChange={e => {
                                    setResumeData({...resumeData, personalInfo: {...resumeData.personalInfo, name: e.target.value}});
                                    if (e.target.value) setErrors(prev => ({...prev, name: ''}));
                                }}
                            />
                            {errors.name && <p className="text-[10px] text-red-500 font-medium px-1">{errors.name}</p>}
                        </div>
                        <div className="space-y-1">
                            <input 
                                placeholder="Email Address *" 
                                className={`p-2 border rounded-lg text-sm w-full transition-colors ${errors.email ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:ring-2 focus:ring-blue-500'}`}
                                value={resumeData.personalInfo.email}
                                onChange={e => {
                                    setResumeData({...resumeData, personalInfo: {...resumeData.personalInfo, email: e.target.value}});
                                    if (e.target.value) setErrors(prev => ({...prev, email: ''}));
                                }}
                            />
                            {errors.email && <p className="text-[10px] text-red-500 font-medium px-1">{errors.email}</p>}
                        </div>
                        <input 
                            placeholder="Phone Number" 
                            className="p-2 border border-slate-200 rounded-lg text-sm w-full shadow-sm"
                            value={resumeData.personalInfo.phone}
                            onChange={e => setResumeData({...resumeData, personalInfo: {...resumeData.personalInfo, phone: e.target.value}})}
                        />
                        <input 
                            placeholder="Location (e.g. New York, NY)" 
                            className="p-2 border border-slate-200 rounded-lg text-sm w-full shadow-sm"
                            value={resumeData.personalInfo.location}
                            onChange={e => setResumeData({...resumeData, personalInfo: {...resumeData.personalInfo, location: e.target.value}})}
                        />
                        <input 
                            placeholder="LinkedIn Profile URL" 
                            className="p-2 border border-slate-200 rounded-lg text-sm w-full shadow-sm"
                            value={resumeData.personalInfo.linkedin || ''}
                            onChange={e => setResumeData({...resumeData, personalInfo: {...resumeData.personalInfo, linkedin: e.target.value}})}
                        />
                        <input 
                            placeholder="Portfolio URL" 
                            className="p-2 border border-slate-200 rounded-lg text-sm w-full shadow-sm"
                            value={resumeData.personalInfo.portfolio || ''}
                            onChange={e => setResumeData({...resumeData, personalInfo: {...resumeData.personalInfo, portfolio: e.target.value}})}
                        />
                    </div>
                </div>

                {/* Professional Summary */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-800">Professional Summary</h3>
                        <div className="flex gap-2">
                            {analysis?.resumeSections?.summary?.suggestions?.length > 0 && (
                                <div className="group relative">
                                    <div className="p-1 px-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full cursor-help flex items-center gap-1">
                                        <Sparkles size={10} /> {analysis.resumeSections.summary.suggestions.length} Tips
                                    </div>
                                    <div className="absolute z-10 hidden group-hover:block bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl">
                                        <p className="font-bold mb-2 border-b border-slate-700 pb-1">AI Suggestions:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                            {analysis.resumeSections.summary.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}
                            <button 
                                onClick={() => handleEnhance('summary')}
                                disabled={isEnhancing === 'summary'}
                                className="flex items-center gap-2 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
                            >
                                {isEnhancing === 'summary' ? <Sparkles className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                                Enhance
                            </button>
                        </div>
                    </div>
                    <textarea 
                        className="w-full h-32 p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        placeholder="Write a brief professional summary..."
                        value={resumeData.summary}
                        onChange={e => setResumeData({...resumeData, summary: e.target.value})}
                    />
                </div>

                {/* Experience */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-slate-800">Experience</h3>
                            {analysis?.resumeSections?.experience?.suggestions?.length > 0 && (
                                <div className="group relative">
                                    <div className="p-1 px-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full cursor-help flex items-center gap-1">
                                        <Sparkles size={10} /> {analysis.resumeSections.experience.suggestions.length} Tips
                                    </div>
                                    <div className="absolute z-10 hidden group-hover:block bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl">
                                        <p className="font-bold mb-2 border-b border-slate-700 pb-1">AI Suggestions:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                            {analysis.resumeSections.experience.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => setResumeData({...resumeData, experience: [...resumeData.experience, { id: Date.now().toString(), company: '', role: '', duration: '', description: '' }]})}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <div className="space-y-4">
                        {resumeData.experience.map((exp) => (
                            <div key={exp.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative group">
                                <button 
                                    onClick={() => setResumeData({...resumeData, experience: resumeData.experience.filter(e => e.id !== exp.id)})}
                                    className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <input 
                                        placeholder="Company" 
                                        className="p-2 border border-slate-200 rounded-lg text-sm"
                                        value={exp.company}
                                        onChange={e => setResumeData({...resumeData, experience: resumeData.experience.map(it => it.id === exp.id ? {...it, company: e.target.value} : it)})}
                                    />
                                    <input 
                                        placeholder="Role" 
                                        className="p-2 border border-slate-200 rounded-lg text-sm"
                                        value={exp.role}
                                        onChange={e => setResumeData({...resumeData, experience: resumeData.experience.map(it => it.id === exp.id ? {...it, role: e.target.value} : it)})}
                                    />
                                </div>
                                <input 
                                    placeholder="Duration (e.g. Jan 2020 - Present)" 
                                    className="p-2 border border-slate-200 rounded-lg text-sm w-full mb-3"
                                    value={exp.duration}
                                    onChange={e => setResumeData({...resumeData, experience: resumeData.experience.map(it => it.id === exp.id ? {...it, duration: e.target.value} : it)})}
                                />
                                <div className="relative">
                                    <textarea 
                                        className="w-full h-24 p-2 border border-slate-200 rounded-lg text-sm"
                                        placeholder="Achievements and responsibilities..."
                                        value={exp.description}
                                        onChange={e => setResumeData({...resumeData, experience: resumeData.experience.map(it => it.id === exp.id ? {...it, description: e.target.value} : it)})}
                                    />
                                    <button 
                                        onClick={() => handleEnhance(`exp-${exp.id}`)}
                                        disabled={isEnhancing === `exp-${exp.id}`}
                                        className="absolute bottom-2 right-2 flex items-center gap-2 text-[10px] font-bold text-purple-600 bg-white/80 backdrop-blur px-2 py-1 rounded border border-purple-100 hover:bg-purple-50 transition-colors"
                                    >
                                        {isEnhancing === `exp-${exp.id}` ? <Sparkles className="animate-spin" size={10}/> : <Sparkles size={10}/>}
                                        Optimize Points
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Skills */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-slate-800">Skills</h3>
                            {analysis?.resumeSections?.skills?.suggestions?.length > 0 && (
                                <div className="group relative">
                                    <div className="p-1 px-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full cursor-help flex items-center gap-1">
                                        <Sparkles size={10} /> {analysis.resumeSections.skills.suggestions.length} Tips
                                    </div>
                                    <div className="absolute z-10 hidden group-hover:block bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl">
                                        <p className="font-bold mb-2 border-b border-slate-700 pb-1">AI Suggestions:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                            {analysis.resumeSections.skills.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => handleEnhance('skills')}
                            disabled={isEnhancing === 'skills'}
                            className="flex items-center gap-2 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
                        >
                            {isEnhancing === 'skills' ? <Sparkles className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                            Tailor Skills
                        </button>
                    </div>
                    <input 
                        placeholder="e.g. React, TypeScript, Product Management (Comma separated)" 
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        value={resumeData.skills.join(', ')}
                        onChange={e => setResumeData({...resumeData, skills: e.target.value.split(',').map(s => s.trim())})}
                    />
                </div>

                {/* Education */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-slate-800">Education</h3>
                            {analysis?.resumeSections?.education?.suggestions?.length > 0 && (
                                <div className="group relative">
                                    <div className="p-1 px-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full cursor-help flex items-center gap-1">
                                        <Sparkles size={10} /> {analysis.resumeSections.education.suggestions.length} Tips
                                    </div>
                                    <div className="absolute z-10 hidden group-hover:block bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl">
                                        <p className="font-bold mb-2 border-b border-slate-700 pb-1">AI Suggestions:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                            {analysis.resumeSections.education.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => setResumeData({...resumeData, education: [...resumeData.education, { id: Date.now().toString(), institution: '', degree: '', duration: '' }]})}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <div className="space-y-4">
                        {resumeData.education.map((edu) => (
                            <div key={edu.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative group">
                                <button 
                                    onClick={() => setResumeData({...resumeData, education: resumeData.education.filter(e => e.id !== edu.id)})}
                                    className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <input 
                                    placeholder="Institution" 
                                    className="p-2 border border-slate-200 rounded-lg text-sm w-full mb-3"
                                    value={edu.institution}
                                    onChange={e => setResumeData({...resumeData, education: resumeData.education.map(it => it.id === edu.id ? {...it, institution: e.target.value} : it)})}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <input 
                                        placeholder="Degree" 
                                        className="p-2 border border-slate-200 rounded-lg text-sm"
                                        value={edu.degree}
                                        onChange={e => setResumeData({...resumeData, education: resumeData.education.map(it => it.id === edu.id ? {...it, degree: e.target.value} : it)})}
                                    />
                                    <input 
                                        placeholder="Dates" 
                                        className="p-2 border border-slate-200 rounded-lg text-sm"
                                        value={edu.duration}
                                        onChange={e => setResumeData({...resumeData, education: resumeData.education.map(it => it.id === edu.id ? {...it, duration: e.target.value} : it)})}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Projects */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-slate-800">Projects</h3>
                            {analysis?.resumeSections?.projects?.suggestions?.length > 0 && (
                                <div className="group relative">
                                    <div className="p-1 px-2 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full cursor-help flex items-center gap-1">
                                        <Sparkles size={10} /> {analysis.resumeSections.projects.suggestions.length} Tips
                                    </div>
                                    <div className="absolute z-10 hidden group-hover:block bottom-full left-0 mb-2 w-64 p-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl">
                                        <p className="font-bold mb-2 border-b border-slate-700 pb-1">AI Suggestions:</p>
                                        <ul className="list-disc ml-4 space-y-1">
                                            {analysis.resumeSections.projects.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={() => setResumeData({...resumeData, projects: [...resumeData.projects, { id: Date.now().toString(), title: '', description: '' }]})}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <div className="space-y-4">
                        {resumeData.projects.map((proj) => (
                            <div key={proj.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative group">
                                <button 
                                    onClick={() => setResumeData({...resumeData, projects: resumeData.projects.filter(p => p.id !== proj.id)})}
                                    className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <input 
                                    placeholder="Project Title" 
                                    className="p-2 border border-slate-200 rounded-lg text-sm w-full mb-3"
                                    value={proj.title}
                                    onChange={e => setResumeData({...resumeData, projects: resumeData.projects.map(it => it.id === proj.id ? {...it, title: e.target.value} : it)})}
                                />
                                <div className="relative">
                                    <textarea 
                                        className="w-full h-24 p-2 border border-slate-200 rounded-lg text-sm"
                                        placeholder="Project description and key achievements (quantified)..."
                                        value={proj.description}
                                        onChange={e => setResumeData({...resumeData, projects: resumeData.projects.map(it => it.id === proj.id ? {...it, description: e.target.value} : it)})}
                                    />
                                    <button 
                                        onClick={() => handleEnhance(`proj-${proj.id}`)}
                                        disabled={isEnhancing === `proj-${proj.id}`}
                                        className="absolute bottom-2 right-2 flex items-center gap-2 text-[10px] font-bold text-purple-600 bg-white/80 backdrop-blur px-2 py-1 rounded border border-purple-100 hover:bg-purple-50 transition-colors"
                                    >
                                        {isEnhancing === `proj-${proj.id}` ? <Sparkles className="animate-spin" size={10}/> : <Sparkles size={10}/>}
                                        Optimize with AI Tips
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Awards */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-800">Awards & Honors</h3>
                        <button 
                            onClick={() => handleEnhance('awards')}
                            disabled={isEnhancing === 'awards'}
                            className="flex items-center gap-2 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
                        >
                            {isEnhancing === 'awards' ? <Sparkles className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                            Optimize
                        </button>
                    </div>
                    <textarea 
                        className="w-full h-20 p-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="List your awards (comma separated)..."
                        value={resumeData.awards.join(', ')}
                        onChange={e => setResumeData({...resumeData, awards: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '')})}
                    />
                </div>

                {/* Certifications */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-800">Certifications</h3>
                        <button 
                            onClick={() => handleEnhance('certifications')}
                            disabled={isEnhancing === 'certifications'}
                            className="flex items-center gap-2 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
                        >
                            {isEnhancing === 'certifications' ? <Sparkles className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                            Verify & Tailor
                        </button>
                    </div>
                    <textarea 
                        className="w-full h-20 p-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="List your certifications (comma separated)..."
                        value={resumeData.certifications.join(', ')}
                        onChange={e => setResumeData({...resumeData, certifications: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '')})}
                    />
                </div>

                {/* Languages */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-slate-800">Languages</h3>
                        <button 
                            onClick={() => handleEnhance('languages')}
                            disabled={isEnhancing === 'languages'}
                            className="flex items-center gap-2 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition-colors disabled:opacity-50"
                        >
                            {isEnhancing === 'languages' ? <Sparkles className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                            Standardize
                        </button>
                    </div>
                    <input 
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                        placeholder="e.g. English (Fluent), French (Conversational)..."
                        value={resumeData.languages.join(', ')}
                        onChange={e => setResumeData({...resumeData, languages: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '')})}
                    />
                </div>
            </div>

            {/* Preview Section */}
            <div className="w-full lg:w-1/2">
                <div className="sticky top-6">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                            {['classic', 'modern', 'professional', 'executive'].map((t) => (
                                <button 
                                    key={t}
                                    onClick={() => setTemplate(t as any)}
                                    className={`px-3 py-1.5 text-[10px] font-bold rounded-md capitalize transition-all ${template === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={downloadPDF}
                            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
                        >
                            <Download size={18} />
                            Download PDF
                        </button>
                    </div>

                    {/* Resume Sheet */}
                    <div 
                        id="resume-preview" 
                        className={`bg-white shadow-2xl p-10 min-h-[800px] border ${template === 'classic' || template === 'executive' ? 'font-serif' : 'font-sans'}`}
                        style={{ 
                            fontFamily: template === 'classic' || template === 'executive' ? "'Times New Roman', Times, serif" : "Inter, system-ui, sans-serif",
                            lineHeight: template === 'professional' ? '1.5' : '1.4',
                            borderColor: '#f1f5f9' 
                        }}
                    >
                        {/* Executive Template Header */}
                        {template === 'executive' ? (
                             <div className="text-center mb-10 border-b-4 border-double pb-6">
                                <h1 className="text-3xl font-bold uppercase mb-2 tracking-widest">{resumeData.personalInfo.name || 'YOUR NAME'}</h1>
                                <div className="text-[10px] uppercase font-bold tracking-widest flex justify-center gap-4" style={{ color: '#475569' }}>
                                    <span>{resumeData.personalInfo.email}</span>
                                    <span>{resumeData.personalInfo.phone}</span>
                                    <span>{resumeData.personalInfo.location}</span>
                                </div>
                                {(resumeData.personalInfo.linkedin || resumeData.personalInfo.portfolio) && (
                                    <div className="text-[10px] mt-2 flex justify-center gap-4 italic" style={{ color: '#64748b' }}>
                                        {resumeData.personalInfo.linkedin && <span>{resumeData.personalInfo.linkedin.replace(/^https?:\/\//, '')}</span>}
                                        {resumeData.personalInfo.portfolio && <span>{resumeData.personalInfo.portfolio.replace(/^https?:\/\//, '')}</span>}
                                    </div>
                                )}
                             </div>
                        ) : template === 'professional' ? (
                            /* Professional Header (Compact Sidebar Style) */
                            <div className="mb-8 border-l-4 pl-6 py-2" style={{ borderLeftColor: '#0f172a' }}>
                                <h1 className="text-4xl font-bold mb-1" style={{ color: '#0f172a' }}>{resumeData.personalInfo.name || 'YOUR NAME'}</h1>
                                <div className="text-xs font-medium" style={{ color: '#475569' }}>
                                    {resumeData.personalInfo.email} • {resumeData.personalInfo.phone} • {resumeData.personalInfo.location}
                                    {(resumeData.personalInfo.linkedin || resumeData.personalInfo.portfolio) && (
                                        <div className="mt-1 font-normal" style={{ color: '#64748b' }}>
                                            {resumeData.personalInfo.linkedin && resumeData.personalInfo.linkedin.replace(/^https?:\/\//, '')}
                                            {resumeData.personalInfo.portfolio && ` • ${resumeData.personalInfo.portfolio.replace(/^https?:\/\//, '')}`}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : template === 'modern' ? (
                            <div className="mb-8 flex justify-between items-start border-b-2 pb-6" style={{ borderColor: '#2563eb' }}>
                                <div>
                                    <h1 className="text-3xl font-black mb-1" style={{ color: '#0f172a' }}>{resumeData.personalInfo.name || 'YOUR NAME'}</h1>
                                    <p className="font-bold uppercase tracking-widest text-[10px]" style={{ color: '#2563eb' }}>Professional Resume</p>
                                </div>
                                <div className="text-right text-[10px] space-y-1" style={{ color: '#475569' }}>
                                    <p>{resumeData.personalInfo.email}</p>
                                    <p>{resumeData.personalInfo.phone}</p>
                                    <p>{resumeData.personalInfo.location}</p>
                                    {resumeData.personalInfo.linkedin && <p>{resumeData.personalInfo.linkedin.replace(/^https?:\/\//, '')}</p>}
                                    {resumeData.personalInfo.portfolio && <p>{resumeData.personalInfo.portfolio.replace(/^https?:\/\//, '')}</p>}
                                </div>
                            </div>
                        ) : (
                            /* Classic Template Header */
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-bold uppercase mb-1 tracking-wider" style={{ color: '#000000' }}>{resumeData.personalInfo.name || 'YOUR NAME'}</h1>
                                <div className="text-xs space-x-2">
                                    <span>{resumeData.personalInfo.email || 'email@example.com'}</span>
                                    {resumeData.personalInfo.phone && <span>• {resumeData.personalInfo.phone}</span>}
                                    {resumeData.personalInfo.location && <span>• {resumeData.personalInfo.location}</span>}
                                    {resumeData.personalInfo.linkedin && <span>• {resumeData.personalInfo.linkedin.replace(/^https?:\/\//, '')}</span>}
                                    {resumeData.personalInfo.portfolio && <span>• {resumeData.personalInfo.portfolio.replace(/^https?:\/\//, '')}</span>}
                                </div>
                            </div>
                        )}

                        {/* Summary */}
                        {resumeData.summary && (
                            <div className={template === 'executive' ? 'mb-10' : 'mb-6'}>
                                <h2 className={`text-sm font-bold border-b mb-2 uppercase ${template === 'executive' ? 'text-center border-none italic tracking-widest' : ''}`} style={{ 
                                    color: template === 'modern' ? '#1d4ed8' : '#000000',
                                    borderColor: template === 'modern' ? '#dbeafe' : '#000000'
                                }}>Professional Summary</h2>
                                <p className={`text-xs text-justify leading-relaxed ${template === 'executive' ? 'px-10' : ''}`} style={{ color: '#333333' }}>{resumeData.summary}</p>
                            </div>
                        )}

                        {/* Experience */}
                        <div className={template === 'executive' ? 'mb-10' : 'mb-6'}>
                            <h2 className={`text-sm font-bold border-b mb-3 uppercase ${template === 'executive' ? 'tracking-widest' : ''}`} style={{ 
                                color: template === 'modern' ? '#1d4ed8' : '#000000',
                                borderColor: template === 'modern' ? '#dbeafe' : '#000000'
                            }}>Professional Experience</h2>
                            <div className="space-y-6">
                                {resumeData.experience.length > 0 ? resumeData.experience.map(exp => (
                                    <div key={exp.id}>
                                        <div className="flex justify-between text-xs font-bold mb-1">
                                            <span style={{ color: template === 'modern' ? '#0f172a' : '#000000', fontSize: '14px' }}>{exp.company}</span>
                                            <span style={{ color: '#64748b' }}>{exp.duration}</span>
                                        </div>
                                        <div className="text-xs mb-2 flex justify-between" style={{ 
                                            fontStyle: template === 'modern' ? 'normal' : 'italic',
                                            fontWeight: template === 'modern' ? '600' : 'normal',
                                            color: template === 'modern' ? '#2563eb' : '#000000'
                                        }}>
                                            <span>{exp.role}</span>
                                        </div>
                                        <div className="text-xs whitespace-pre-wrap pl-2">
                                            {exp.description.split('\n').map((line, idx) => line.trim() && (
                                                <div key={idx} className="flex gap-2 mb-1.5 leading-relaxed text-justify">
                                                    <span style={{ color: template === 'modern' ? '#60a5fa' : '#000000' }}>•</span>
                                                    <span style={{ color: '#334155' }}>{line.trim().startsWith('•') ? line.trim().substring(1) : line}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )) : <p className="text-xs italic" style={{ color: '#64748b' }}>Add your professional experience...</p>}
                            </div>
                        </div>

                        {/* Projects */}
                        {resumeData.projects.length > 0 && (
                            <div className="mb-6">
                                <h2 className="text-sm font-bold border-b mb-3 uppercase" style={{ 
                                    color: template === 'modern' ? '#1d4ed8' : '#000000',
                                    borderColor: template === 'modern' ? '#dbeafe' : '#000000'
                                }}>Projects</h2>
                                <div className="space-y-4">
                                    {resumeData.projects.map(proj => (
                                        <div key={proj.id}>
                                            <div className="text-xs font-bold" style={{ color: template === 'modern' ? '#0f172a' : '#000000' }}>{proj.title}</div>
                                            <div className="text-xs whitespace-pre-wrap pl-2 mt-1">
                                                {proj.description.split('\n').map((line, idx) => line.trim() && (
                                                    <div key={idx} className="flex gap-2 mb-1">
                                                        <span style={{ color: template === 'modern' ? '#60a5fa' : '#000000' }}>•</span>
                                                        <span style={{ color: '#334155' }}>{line.trim().startsWith('•') ? line.trim().substring(1) : line}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Skills */}
                        <div className="mb-6">
                            <h2 className="text-sm font-bold border-b mb-2 uppercase" style={{ 
                                color: template === 'modern' ? '#1d4ed8' : '#000000',
                                borderColor: template === 'modern' ? '#dbeafe' : '#000000'
                            }}>Technical Skills</h2>
                            <p className="text-xs">
                                <span className="font-bold">Skills: </span>
                                <span style={{ color: template === 'modern' ? '#334155' : '#000000' }}>{resumeData.skills.join(', ')}</span>
                            </p>
                        </div>

                        {/* Education */}
                        <div className="mb-6">
                            <h2 className="text-sm font-bold border-b mb-3 uppercase" style={{ 
                                color: template === 'modern' ? '#1d4ed8' : '#000000',
                                borderColor: template === 'modern' ? '#dbeafe' : '#000000'
                            }}>Education</h2>
                            <div className="space-y-3 text-xs">
                                {resumeData.education.length > 0 ? resumeData.education.map(edu => (
                                    <div key={edu.id} className="flex justify-between">
                                        <div>
                                            <span className="font-bold" style={{ color: template === 'modern' ? '#0f172a' : '#000000' }}>{edu.institution}</span>, <span style={{ color: '#4b5563' }}>{edu.degree}</span>
                                        </div>
                                        <span style={{ color: '#64748b' }}>{edu.duration}</span>
                                    </div>
                                )) : (
                                    <div className="flex justify-between">
                                         <span>Your University</span>
                                         <span>2016 - 2020</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Additional Sections */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {resumeData.awards.length > 0 && (
                                <div>
                                    <h2 className="text-[10px] font-bold border-b mb-2 uppercase" style={{ color: template === 'modern' ? '#1d4ed8' : '#000000' }}>Awards</h2>
                                    <ul className="text-[10px] list-disc ml-4 space-y-1">
                                        {resumeData.awards.map((a, i) => <li key={i}>{a}</li>)}
                                    </ul>
                                </div>
                            )}
                            {resumeData.certifications.length > 0 && (
                                <div>
                                    <h2 className="text-[10px] font-bold border-b mb-2 uppercase" style={{ color: template === 'modern' ? '#1d4ed8' : '#000000' }}>Certifications</h2>
                                    <ul className="text-[10px] list-disc ml-4 space-y-1">
                                        {resumeData.certifications.map((c, i) => <li key={i}>{c}</li>)}
                                    </ul>
                                </div>
                            )}
                            {resumeData.languages.length > 0 && (
                                <div className="col-span-1 md:col-span-2 mt-2">
                                    <h2 className="text-[10px] font-bold border-b mb-2 uppercase" style={{ color: template === 'modern' ? '#1d4ed8' : '#000000' }}>Languages</h2>
                                    <p className="text-[10px]">{resumeData.languages.join(' • ')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
