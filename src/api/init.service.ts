import api from "@/lib/api";

class InitService {
    async initSettings(records: { key: string, value: string }[]) {
        await api.invokeApi('init_settings', { data: records });
    }
}

export default new InitService();