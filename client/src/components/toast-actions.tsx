import { toast, type Id } from 'react-toastify';
import Toast from './ui/toast';

export const toaster = (props: { title: string; text: string }): Id => toast(<Toast {...props} />)
