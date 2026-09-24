import { redirect } from 'next/navigation'

/** Trang gốc chỉ để đưa thẳng vào dashboard — trước đây còn là trang mẫu
 *  của create-next-app, ai mở link gốc cũng thấy "To get started, edit...". */
export default function Home() {
  redirect('/dashboard')
}
