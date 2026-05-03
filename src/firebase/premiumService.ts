import { db, storage } from './config'; 
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// 1. फाइल को Premium फोल्डर में अपलोड करें
export const uploadPremiumFile = async (courseId: string, file: File) => {
  try {
    const storageRef = ref(storage, `premium_content/${courseId}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.error("Upload Error:", error);
    throw error;
  }
};

// 2. डाटा को Course के अंदर save करें (ताकि Free Search में न दिखे)
export const savePremiumContent = async (courseId: string, title: string, link: string, type: 'PDF' | 'VIDEO') => {
  try {
    await addDoc(collection(db, `courses/${courseId}/content`), {
      title,
      link,
      type,
      courseId,
      createdAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Database Error:", error);
    throw error;
  }
};