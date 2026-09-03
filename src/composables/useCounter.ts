import { ref } from 'vue';

export default function useCounter() {
    const count = ref(0);

    const tambah = () => count.value++;
    const kurang = () => count.value--;

    return { count, tambah, kurang };
} 