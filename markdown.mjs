import MarkdownIt from 'markdown-it';
import {katex} from '@mdit/plugin-katex';
import {tasklist} from '@mdit/plugin-tasklist';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

export const markdown=new MarkdownIt({
  html:false,linkify:true,breaks:false,
  highlight(code,language){
    if(language&&hljs.getLanguage(language)){
      try{return hljs.highlight(code,{language,ignoreIllegals:true}).value}catch{}
    }
    return '';
  },
}).use(katex,{delimiters:'all',throwOnError:false,trust:false,maxExpand:1000,maxSize:20}).use(tasklist,{disabled:true,label:false});

// Remote image paths and server file links cannot be opened in a phone browser.
// Keep their labels visible instead of sending an unauthenticated file request.
markdown.renderer.rules.image=(tokens,i)=>'<span class="attachment-label">[图片：'+markdown.utils.escapeHtml(tokens[i].content||'附件')+']</span>';
const linkOpen=markdown.renderer.rules.link_open||((tokens,i,options,env,self)=>self.renderToken(tokens,i,options));
markdown.renderer.rules.link_open=(tokens,i,options,env,self)=>{
  const token=tokens[i],href=token.attrGet('href')||'';
  if(!/^https?:\/\//i.test(href)){
    token.attrSet('data-server-path',href);token.attrSet('title','服务器文件路径：'+href);token.attrSet('href','#');
  }else{token.attrSet('target','_blank');token.attrSet('rel','noopener noreferrer')}
  return linkOpen(tokens,i,options,env,self);
};
export function renderMarkdown(element,text){
  element.classList.add('markdown');
  element.innerHTML=DOMPurify.sanitize(markdown.render(text),{FORBID_TAGS:['img','style','script','iframe','form'],FORBID_ATTR:['srcset'],ADD_ATTR:['target']});
  for(const table of [...element.querySelectorAll('table')]){
    const wrap=document.createElement('div');wrap.className='table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','表格，可左右滑动');table.replaceWith(wrap);wrap.append(table);
  }
  for(const pre of element.querySelectorAll('pre')){
    pre.tabIndex=0;const code=pre.querySelector('code');if(!code)continue;
    const bar=document.createElement('div');bar.className='code-toolbar';
    const label=document.createElement('span');label.textContent=code.className.match(/language-([\w+-]+)/)?.[1]||'代码';
    const copy=document.createElement('button');copy.type='button';copy.textContent='复制';copy.setAttribute('aria-label','复制代码');
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.textContent);copy.textContent='已复制';setTimeout(()=>copy.textContent='复制',1500)}catch{copy.textContent='请长按代码复制'}};
    bar.append(label,copy);pre.before(bar);
  }
}
