/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, FileText, CheckCircle, Zap, X, Download, Loader2, AlertCircle, History, ChevronRight, AlertTriangle, TrendingUp, Compass, Target, LogIn, LogOut, FileEdit } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { auth, db, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, orderBy, getDocs, serverTimestamp, limit } from 'firebase/firestore';
import ResumeBuilder from './components/ResumeBuilder';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

// Configure Gemini (Lazy initialization)
let aiClient: GoogleGenAI | null = null;
function getAIClient() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}


const HighlightedText = ({ text, highlights }: { text: string; highlights: string[] }) => {
    if (!highlights.length) return <p className="whitespace-pre-wrap">{text}</p>;
    const safeHighlights = highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a,b) => b.length - a.length);
    const regex = new RegExp(`(${safeHighlights.join('|')})`, 'gi');
    const parts = text.split(regex);
    return (
      <div className="whitespace-pre-wrap">
        {parts.map((p, i) => highlights.some(h => h.toLowerCase() === p.toLowerCase()) ? <span key={i} className="bg-yellow-200 font-bold rounded px-0.5">{p}</span> : p)}
      </div>
    );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<'home' | 'history' | 'compare' | 'builder'>('home');
  const [resumeText, setResumeText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<any | null>(null);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<any[]>([]);
  const [showTour, setShowTour] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadHistory(currentUser.uid);
      } else {
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadHistory = async (uid: string) => {
    try {
        const q = query(collection(db, `users/${uid}/analyses`), orderBy('createdAt', 'desc'), limit(5));
        const snapshot = await getDocs(q);
        const loadedHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setHistory(loadedHistory);
    } catch(e) {
        console.error("Failed to load history", e);
    }
  };

  const signIn = async () => {
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (e) {
        console.error("Sign in failed", e);
    }
  };

  const saveToHistory = async (newAnalysis: any) => {
    if (!user) return;
    try {
        await addDoc(collection(db, `users/${user.uid}/analyses`), {
            ...newAnalysis,
            userId: user.uid,
            filename: selectedFile?.name || 'Unknown',
            jobDescription,
            createdAt: serverTimestamp(),
        });
        loadHistory(user.uid);
    } catch(e) {
        console.error("Failed to save to history", e);
    }
  };
    
  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setErrorMessage('');
    if (!file) return;

    if (file.type !== 'application/pdf') {
        setErrorMessage('Unsupported file format. Please upload a PDF.');
        return;
    }

    setSelectedFile(file);
    setExtractionStatus(`Processing ${file.name}...`);
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
        
        let text = '';
        console.log("PDF loaded, total pages:", pdf.numPages);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          console.log("Page", i, "content keys:", Object.keys(content));
          if (content.items) {
            text += content.items.map((item: any) => item.str).join(' ') + '\n';
          }
        }
        console.log("Extraction complete, text length:", text.length);
        setResumeText(text);
        setExtractionStatus(`File selected: ${file.name}`);
        
        // Fetch previous analysis if user logged in
        if (user) {
            const q = query(collection(db, `users/${user.uid}/analyses`), orderBy('createdAt', 'desc'), limit(1));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const prev = snapshot.docs[0].data();
                setPreviousAnalysis(prev);
            } else {
                setPreviousAnalysis(null);
            }
        }
    } catch (e) {
        console.error("PDF Extraction Error:", e);
        setErrorMessage('Failed to extract text from PDF: ' + (e instanceof Error ? e.message : 'Unknown PDF error.'));
        setExtractionStatus('');
    }
  };

  const downloadAnalysis = () => {
    const element = document.createElement("a");
    const file = new Blob([JSON.stringify(analysis, null, 2)], {type: 'application/json'});
    element.href = URL.createObjectURL(file);
    element.download = "ats_analysis.json";
    document.body.appendChild(element); 
    element.click();
    document.body.removeChild(element);
  };

  const enhanceContentWithAI = async (section: string, currentContent: string, suggestions: string[] = []): Promise<string> => {
    try {
      const ai = getAIClient();
      
      const prompt = `
        As an expert resume writer and career coach, enhance the following ${section} section of a resume to be "100% Selectable".
        The goal is to make it high-impact, results-oriented, perfectly ATS-optimized, and CONCISE.
        
        Job Description Context:
        ${jobDescription}
        
        Analysis Data for Context:
        - Missing Keywords: ${analysis?.missingKeywords?.join(', ')}
        - Core Strengths: ${analysis?.strengths?.join(', ')}
        
        AI suggestions specifically for this section - THESE MUST BE INCORPORATED AS THE HIGHEST PRIORITY:
        ${suggestions.length > 0 ? suggestions.map(s => `- ${s}`).join('\n') : 'Follow general best practices for this section.'}
        
        Current Content:
        ${currentContent}
        
        CRITICAL 100% SELECTABILITY & CONCISENESS INSTRUCTIONS:
        1. Incorporate missing keywords NATURALLY.
        2. ADDRESSING THE SPECIFIC AI SUGGESTIONS PROVIDED IS MANDATORY and must be the foundation of your enhancements.
        3. Use strong action verbs (e.g., Spearheaded, Orchestrated, Optimized).
        4. QUANTIFY achievements with metrics.
        5. SHORTEN and REDUCE: Merge repetitive points, remove fluff, and ensure every word earns its place. Aim for maximum impact with minimum word count.
        6. For Experience and Projects: Ensure bullet points are punchy and focused on results rather than just responsibilities.
        7. Return ONLY the enhanced text. No commentary or markdown formatting.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      return response.text.trim();
    } catch (e) {
      console.error("AI Enhancement failed", e);
      return currentContent;
    }
  };

  const getFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };
    
  const analyzeResume = async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setErrorMessage('');
    
    const messages = ['Extracting keywords...', 'Comparing against job description...', 'Generating suggestions...'];
    let messageIdx = 0;
    setExtractionStatus(messages[0]);
    const interval = setInterval(() => {
        messageIdx = (messageIdx + 1) % messages.length;
        setExtractionStatus(messages[messageIdx]);
    }, 2000);

    const modelsToTry = ["gemini-3-flash-preview", "gemini-3.1-pro-preview"];
    
    for (const model of modelsToTry) {
      try {
        const ai = getAIClient();
        const base64File = await getFileAsBase64(selectedFile);
        const base64Data = base64File.split(',')[1];
        
        const prompt = [
          { text: `
            Analyze the attached resume and job description.
            EXTRACT ALL DATA from the resume accurately into the structured JSON format below.
            It is CRITICAL that you do not miss any section found in the resume (Experience, Projects, Awards, etc.).
            
            Return ONLY a valid JSON object. No Markdown code fences, no extra text.
            Format:
            {
              "score": number (0-100),
              "missingKeywords": string[],
              "strengths": string[],
              "selectabilityAudit": {
                  "hasContactInfo": boolean,
                  "hasLinkedIn": boolean,
                  "hasQuantifiedImpact": boolean,
                  "hasActionVerbs": boolean,
                  "hasProfessionalSummary": boolean,
                  "scoreMessage": string
              },
              "pageRecommendation": {
                  "isAppropriate": boolean,
                  "message": string
              },
              "resumeSections": {
                "summary": { "content": string, "suggestions": string[] },
                "personalInfo": {
                  "name": string,
                  "email": string,
                  "phone": string,
                  "location": string,
                  "linkedin": string,
                  "portfolio": string
                },
                "experience": { 
                    "items": Array<{ "company": string, "role": string, "duration": string, "content": string }>,
                    "suggestions": string[] 
                },
                "education": { 
                    "items": Array<{ "institution": string, "degree": string, "duration": string }>,
                    "suggestions": string[] 
                },
                "skills": { "content": string, "suggestions": string[] },
                "projects": { 
                    "items": Array<{ "title": string, "content": string }>,
                    "suggestions": string[] 
                },
                "awards": { "items": Array<string>, "suggestions": string[] },
                "certifications": { "items": Array<string>, "suggestions": string[] },
                "languages": { "items": Array<string>, "suggestions": string[] }
              },
              "overallSuggestions": {
                "immediate": string[],
                "shortTerm": string[],
                "longTerm": string[]
              },
              "fitAssessment": {
                "isFit": boolean,
                "message": string,
                "isOverqualified": boolean,
                "overqualifiedReason": string
              }
            }
            
            EXTRACTION RULES:
            - If a section exists in the resume, you MUST extract its details into the corresponding "resumeSections" field.
            - "experience" and "projects" items "content" should be a concatenated string of bullet points or description found for that item.
            - "awards", "certifications", and "languages" items should be lists of strings.
            - If data is missing for a field, use an empty string or empty array as appropriate.
            
            Perform a VERY STRICT ATS keyword match audit. 
            Auditing for "100% Selectability": 
            1. Check for complete contact info (LinkedIn is critical).
            2. Check for quantified impact (numbers, %, $).
            3. Check for strong action verbs.
            4. Ensure PROJECTS include specific achievements and technical details.
            
            Assess the resume's length (number of pages) based on the detected experience level: 
            State if it is appropriate (e.g., 1 page for entry-level, 1-2 pages for mid-level, 2+ pages for senior).
            Provide recommendations if it should be shortened or can be expanded.
            
            Evaluate if the resume fits the Job Description. If it's a poor fit, explain why. 
            If the resume indicates substantially more experience than requested, mark as overqualified.
            
            Job Details for Context:
            - LinkedIn extracted: ${analysis?.resumeSections?.personalInfo?.linkedin || 'None'}
            - Portfolio extracted: ${analysis?.resumeSections?.personalInfo?.portfolio || 'None'}
            
            Target Job Description:
            ${jobDescription}
          ` },
          {
            inlineData: {
              data: base64Data,
              mimeType: "application/pdf"
            }
          }
        ];
  
        const aiCall = ai.models.generateContent({
          model: model,
          contents: prompt,
        });
        
        const timeout = new Promise((_, reject) =>
           setTimeout(() => reject(new Error('TIMEOUT')), 30000)
        );

        const response: any = await Promise.race([aiCall, timeout]);
        
        const text = response.text || '{}';
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisResult = JSON.parse(jsonStr);
        
        setAnalysis(analysisResult);
        saveToHistory(analysisResult);
        clearInterval(interval);
        setExtractionStatus('');
        setIsAnalyzing(false);
        return; // Success
      } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT') {
           clearInterval(interval);
           setExtractionStatus("You have a lot of skills and experience it takes time to analyse kindly be patient and think about the best version of your future professional self");
           console.warn(`Model ${model} timed out`);
           continue; // Try next
        }
        console.error(`Analysis Error with model ${model}:`, error);
        // Continue to the next model
      }
    }
    
    // If all models failed
    setErrorMessage('Failed to analyze resume after trying multiple models. Please try again later.');
    setAnalysis(null);
    clearInterval(interval);
    setExtractionStatus('');
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12">
      {showTour && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setShowTour(false)}>
                <div className="bg-white p-8 rounded-3xl max-w-lg" onClick={e => e.stopPropagation()}>
                    <h2 className="text-2xl font-bold mb-4">Welcome to ResumePulse!</h2>
                    <p className="text-slate-600 mb-6">Upload your resume and job description to get ATS insights instantly.</p>
                    <button onClick={() => setShowTour(false)} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-semibold">Got it!</button>
                </div>
            </div>
      )}
      
      <header className="max-w-6xl mx-auto mb-16 text-center">
        <div className="flex justify-end gap-2 mb-4">
            <button onClick={() => setCurrentView('home')} className={`text-sm font-semibold ${currentView === 'home' ? 'text-blue-600' : 'text-slate-500'} hover:text-blue-600 transition-colors`}>Home</button>
            <button onClick={() => setCurrentView('history')} className={`text-sm font-semibold ${currentView === 'history' ? 'text-blue-600' : 'text-slate-500'} hover:text-blue-600 transition-colors`}>History</button>
            <button onClick={() => setCurrentView('builder')} className={`text-sm font-semibold ${currentView === 'builder' ? 'text-blue-600' : 'text-slate-500'} hover:text-blue-600 transition-colors`}>Enhancer</button>
            
            {user ? (
                <button onClick={() => signOut(auth)} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-600 transition-colors">
                    <LogOut size={16}/> Sign Out
                </button>
            ) : (
                <button onClick={signIn} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    <LogIn size={16}/> Sign In
                </button>
            )}
        </div>
        <h1 className="text-5xl font-extrabold text-slate-950 tracking-tighter mb-4">Resume<span className="text-blue-600">Pulse</span></h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">Get the competitive edge your career deserves with real-time, AI-driven ATS optimization.</p>
      </header>

      <main className="max-w-6xl mx-auto">
        {currentView === 'builder' ? (
          <ResumeBuilder 
            analysis={analysis} 
            onBack={() => setCurrentView('home')} 
            enhanceWithAI={enhanceContentWithAI}
          />
        ) : currentView === 'history' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                      <h2 className="text-2xl font-bold mb-6">Resume Analysis History</h2>
                      {history.length === 0 ? <p className="text-slate-500">No analyses found.</p> : (
                          <div className="space-y-4">
                              {history.map((h, i) => (
                                  <div key={i} className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                                      <span>{new Date(h.createdAt?.toDate()).toLocaleDateString()}: {h.filename} (Score: {h.score}%)</span>
                                      <div className="flex gap-2">
                                          <input type="checkbox" onChange={() => selectedForCompare.includes(h) ? setSelectedForCompare(selectedForCompare.filter(s => s.id !== h.id)) : setSelectedForCompare([...selectedForCompare, h])} checked={selectedForCompare.some(s => s.id === h.id)} />
                                          <button onClick={() => { setAnalysis(h); setCurrentView('home'); }} className="text-blue-600 font-semibold text-sm">View</button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                      <h2 className="text-2xl font-bold mb-6">Compare Resumes</h2>
                      {selectedForCompare.length < 2 ? <p className="text-slate-500">Select two items from history to compare.</p> : (
                          <>
                              <div className="grid grid-cols-2 gap-4 mb-4">
                                  {selectedForCompare.map((c, i) => (
                                      <div key={i} className="p-4 bg-slate-50 rounded-lg">
                                          <h3 className="font-bold">{c.filename}</h3>
                                          <p>Score: {c.score}%</p>
                                      </div>
                                  ))}
                              </div>
                              <button onClick={() => { 
                                   setAnalysis({
                                       score: Math.abs(selectedForCompare[0].score - selectedForCompare[1].score),
                                       missingKeywords: [], 
                                       strengths: [],
                                       fitAssessment: { isFit: true, message: `Comparison: ${selectedForCompare[0].filename} vs ${selectedForCompare[1].filename}` },
                                       resumeSections: {},
                                       overallSuggestions: { immediate: [], shortTerm: [], longTerm: [] }
                                   }); 
                                   setCurrentView('home'); 
                               }} className="w-full bg-blue-600 text-white font-semibold py-2 rounded-xl hover:bg-blue-700 transition-colors">Compare</button>

                          </>
                      )}
                      <button onClick={() => setSelectedForCompare([])} className="mt-4 text-sm text-red-600">Clear Selection</button>
                  </div>
              </div>
        ) : (
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-8">
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">1. Upload Resume</h2>
              {!selectedFile ? (
                  <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-2xl p-10 hover:border-blue-400 hover:bg-blue-50 cursor-pointer flex flex-col items-center justify-center text-slate-500 transition-all duration-300"
                  >
                      <Upload size={48} className="mb-4 text-slate-400"/>
                      <span className="text-sm font-semibold text-center">Drag & drop or click to upload PDF</span>
                  </div>
              ) : (
                  <div className="relative p-5 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <FileText size={24} className="text-blue-600"/>
                          <span className="text-sm font-medium text-slate-800">{selectedFile.name}</span>
                      </div>
                      <button onClick={() => { setSelectedFile(null); setExtractionStatus(''); setResumeText(''); }} className="p-2 bg-white rounded-full shadow-sm hover:bg-slate-100 text-slate-500 transition-colors">
                          <X size={18}/>
                      </button>
                  </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="application/pdf" className="hidden" />
              {extractionStatus && <div className="flex items-center text-xs font-medium text-blue-600 mt-4"><Loader2 size={14} className="animate-spin mr-2"/>{extractionStatus}</div>}
            </section>
  
            <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">2. Job Match</h2>
              <textarea 
                value={jobDescription} 
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full h-48 p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:outline-none text-sm transition-all"
                placeholder="Paste the target job description here..."
              />
            </section>
  
            <button 
                onClick={analyzeResume}
                disabled={isAnalyzing || !selectedFile || !jobDescription}
                className="w-full flex items-center justify-center p-5 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
              >
                {isAnalyzing ? <><Loader2 className="animate-spin mr-3" size={24}/> Analyzing...</> : <><Target className="mr-3" size={24} /> Run ATS Analysis</>}
            </button>
          </div>
          
          <section className="lg:col-span-7 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-6">
                  <h2 className="text-2xl font-bold text-slate-950 flex items-center">
                      <Zap className="mr-3 text-yellow-500" size={24}/>
                      Analysis Results
                  </h2>
                  {analysis && !isAnalyzing && (
                      <div className="flex gap-2">
                          <button onClick={() => setCurrentView('builder')} className="text-purple-600 hover:bg-purple-50 flex items-center text-sm font-semibold px-4 py-2 bg-purple-50 rounded-xl transition-colors">
                              <FileEdit size={16} className="mr-2"/> Enhance Resume
                          </button>
                          <button onClick={downloadAnalysis} className="text-blue-600 hover:bg-blue-50 flex items-center text-sm font-semibold px-4 py-2 bg-blue-50/50 rounded-xl transition-colors">
                              <Download size={16} className="mr-2"/> Save Report
                          </button>
                      </div>
                  )}
              </div>
              
              <div className="space-y-8">
                  {errorMessage && <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center"><AlertCircle size={20} className="mr-3"/>{errorMessage}</div>}
                  
                  {analysis ? (
                    <div className="space-y-8 animate-in fade-in duration-500">
                      <div className="grid grid-cols-2 gap-6">
                          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ATS Score</h3>
                             <p className="text-5xl font-extrabold text-blue-600">{analysis?.score}%</p>
                             {previousAnalysis && (
                                 <p className={`text-sm font-semibold mt-2 ${analysis?.score >= previousAnalysis.score ? 'text-emerald-600' : 'text-red-600'}`}>
                                     {analysis?.score >= previousAnalysis.score ? '+' : ''}{analysis?.score - previousAnalysis.score}% from last check
                                 </p>
                             )}
                          </div>
                          <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-col justify-center">
                              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Selectability Check</h3>
                              <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-xs">
                                      {analysis?.selectabilityAudit?.hasLinkedIn ? <CheckCircle size={12} className="text-emerald-500" /> : <X size={12} className="text-red-500" />}
                                      <span className={analysis?.selectabilityAudit?.hasLinkedIn ? 'text-slate-700' : 'text-slate-400'}>LinkedIn Profile</span>
                                      {analysis.resumeSections?.personalInfo?.linkedin && (
                                          <a href={analysis.resumeSections.personalInfo.linkedin} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 underline ml-1 truncate max-w-[100px]">Link</a>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                      {analysis.resumeSections?.personalInfo?.portfolio ? <CheckCircle size={12} className="text-emerald-500" /> : <TrendingUp size={12} className="text-slate-300" />}
                                      <span className={analysis.resumeSections?.personalInfo?.portfolio ? 'text-slate-700' : 'text-slate-400'}>Portfolio/Website</span>
                                      {analysis.resumeSections?.personalInfo?.portfolio && (
                                          <a href={analysis.resumeSections.personalInfo.portfolio} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 underline ml-1 truncate max-w-[100px]">Link</a>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                      {analysis?.selectabilityAudit?.hasQuantifiedImpact ? <CheckCircle size={12} className="text-emerald-500" /> : <X size={12} className="text-red-500" />}
                                      <span className={analysis?.selectabilityAudit?.hasQuantifiedImpact ? 'text-slate-700' : 'text-slate-400'}>Quantified Impact</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                      {analysis?.selectabilityAudit?.hasActionVerbs ? <CheckCircle size={12} className="text-emerald-500" /> : <X size={12} className="text-red-500" />}
                                      <span className={analysis?.selectabilityAudit?.hasActionVerbs ? 'text-slate-700' : 'text-slate-400'}>Strong Action Verbs</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center">
                            <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                <span className="font-bold text-slate-900 block mb-1">Length Check:</span>
                                {analysis?.pageRecommendation?.message}
                            </p>
                        </div>
                        <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100 flex items-center">
                            <p className="text-sm text-purple-700 font-medium leading-relaxed">
                                <span className="font-bold text-purple-900 block mb-1">Selectability Pro Tip:</span>
                                {analysis?.selectabilityAudit?.scoreMessage}
                            </p>
                        </div>
                      </div>
                      
                      <div className="p-6 bg-slate-100 rounded-2xl border border-slate-200">
                          <h4 className="font-bold text-slate-900 mb-2">Fit Assessment</h4>
                          <p className={`text-sm ${analysis.fitAssessment?.isFit ? 'text-emerald-700' : 'text-red-700'}`}>{analysis.fitAssessment?.message}</p>
                          {analysis.fitAssessment?.isOverqualified && <p className="text-sm text-orange-700 mt-2 font-semibold">Overqualified status detected: {analysis.fitAssessment?.overqualifiedReason}</p>}
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-6">
                          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                              <h4 className="font-bold text-slate-900 mb-4 flex items-center"><AlertTriangle className="mr-3 text-red-500" size={20}/>Missing Keywords</h4>
                              <ul className="list-none space-y-2">
                                  {analysis?.missingKeywords?.map((k: string, i: number) => <li key={i} className="text-sm text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200">{k}</li>)}
                              </ul>
                          </div>
                          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                              <h4 className="font-bold text-slate-900 mb-4 flex items-center"><CheckCircle className="mr-3 text-emerald-500" size={20}/>Strengths</h4>
                              <ul className="list-none space-y-2">
                                  {analysis?.strengths?.map((s: string, i: number) => <li key={i} className="text-sm text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200">{s}</li>)}
                              </ul>
                          </div>
                      </div>
  
                      <div className="space-y-4">
                          <h4 className="font-bold text-slate-900 text-lg">Detailed Section Suggestions</h4>
                          {analysis?.resumeSections && Object.entries(analysis.resumeSections).map(([section, data]: [string, any]) => (
                              <div key={section} className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                  <h5 className="font-bold text-slate-900 capitalize mb-2">{section}</h5>
                                  {data.content && <p className="text-xs text-slate-500 mb-3 italic">"{data.content.substring(0, 100)}..."</p>}
                                  {data.items && <p className="text-xs text-slate-500 mb-3 italic">Extracted {data.items.length} items</p>}
                                  {data.suggestions && data.suggestions.length > 0 && (
                                    <ul className="list-disc ml-5 text-sm text-slate-600 marker:text-blue-400 space-y-1">
                                        {data.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                    </ul>
                                  )}
                              </div>
                          ))}
                      </div>
                      
                      <div className="space-y-4">
                          <h4 className="font-bold text-slate-900 text-lg">Overall Action Plan</h4>
                          <div className="space-y-4">
                              {analysis?.overallSuggestions?.immediate?.length > 0 && <div className="p-5 bg-red-50/50 rounded-2xl border border-red-100"><h5 className="text-sm font-bold text-red-800 uppercase flex items-center mb-3"><AlertTriangle className="mr-2" size={18}/>Immediate Focus</h5><ul className="list-disc ml-5 text-sm text-red-900 space-y-1">{analysis?.overallSuggestions?.immediate?.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}
                              {analysis?.overallSuggestions?.shortTerm?.length > 0 && <div className="p-5 bg-orange-50/50 rounded-2xl border border-orange-100"><h5 className="text-sm font-bold text-orange-800 uppercase flex items-center mb-3"><TrendingUp className="mr-2" size={18}/>Short-term</h5><ul className="list-disc ml-5 text-sm text-orange-900 space-y-1">{analysis?.overallSuggestions?.shortTerm?.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}
                              {analysis?.overallSuggestions?.longTerm?.length > 0 && <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100"><h5 className="text-sm font-bold text-blue-800 uppercase flex items-center mb-3"><Compass className="mr-2" size={18}/>Long-term</h5><ul className="list-disc ml-5 text-sm text-blue-900 space-y-1">{analysis?.overallSuggestions?.longTerm?.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}
                          </div>
                      </div>
                    </div>
                  ) : isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center p-20 text-center">
                          <div className="w-16 h-16 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                          <p className="font-bold text-lg text-slate-800 mb-2">Analyzing Resume...</p>
                          <p className="text-sm text-slate-500 max-w-xs">{extractionStatus || 'Hang tight, we are crafting your feedback.'}</p>
                      </div>
                  ) : (
                      <div className="text-center p-20 border-2 border-dashed border-slate-100 rounded-3xl text-slate-400">
                          <Target size={48} className="mx-auto mb-6 opacity-50"/>
                          <p className="text-lg font-medium">Ready when you are!</p>
                          <p className="text-sm">Upload a resume and paste a job description<br/>to begin the analysis.</p>
                      </div>
                  )}
              </div>
            </section>
        </div>
        )}
      </main>
      
      {resumeText && !isAnalyzing && !analysis && (
            <div className="max-w-6xl mx-auto mt-10 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <label className="block text-sm font-bold text-slate-900 mb-4">Resume Preview</label>
                <div className="text-sm text-slate-600 max-h-96 overflow-y-auto p-6 bg-slate-50 border border-slate-100 rounded-2xl">
                    <HighlightedText text={resumeText} highlights={analysis ? [...analysis.missingKeywords, ...analysis.strengths] : []} />
                </div>
            </div>
      )}
    </div>
  );
}

