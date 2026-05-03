import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/config';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { CheckCircle, Loader2 } from 'lucide-react';

const Success = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const courseId = searchParams.get('courseId');

    useEffect(() => {
        const unlockNow = async () => {
            const user = auth.currentUser;
            if (user && courseId) {
                try {
                    const userRef = doc(db, "users", user.uid);
                    // यूजर के खाते में कोर्स ID डाल दी (Unlock हो गया!)
                    await updateDoc(userRef, {
                        unlockedCourses: arrayUnion(courseId)
                    });
                    setLoading(false);
                    // 3 सेकंड में 'My Materials' पर भेज दो
                    setTimeout(() => navigate('/my-free-study-materials'), 3000);
                } catch (err) {
                    console.error(err);
                    setLoading(false);
                }
            }
        };
        unlockNow();
    }, [courseId, navigate]);

    return (
        <div className="h-screen flex flex-col items-center justify-center bg-white font-hindi">
            {loading ? (
                <>
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                    <h2 className="text-xl font-black">पेमेंट कन्फर्म हो रही है...</h2>
                </>
            ) : (
                <>
                    <CheckCircle className="w-20 h-20 text-emerald-500 mb-4 animate-bounce" />
                    <h2 className="text-2xl font-black text-slate-900">बधाई हो! कोर्स अनलॉक हो गया 🔥</h2>
                    <p className="text-slate-500">अब आप पढ़ाई शुरू कर सकते हैं।</p>
                </>
            )}
        </div>
    );
};

export default Success;