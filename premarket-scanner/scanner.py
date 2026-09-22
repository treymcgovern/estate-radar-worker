import csv, os, smtplib, sys
from datetime import datetime
from email.message import EmailMessage
from zoneinfo import ZoneInfo
import requests
import yfinance as yf
from yfinance import EquityQuery

TZ=ZoneInfo("America/Los_Angeles")
P_MIN=float(os.getenv("PRICE_MIN","0.10")); P_MAX=float(os.getenv("PRICE_MAX","1.00"))
MIN_PCT=float(os.getenv("MIN_PREMARKET_PCT","5")); MIN_VOL=int(os.getenv("MIN_PREMARKET_VOLUME","1000000"))
DRY=os.getenv("DRY_RUN","false").lower()=="true"
USER=os.getenv("SMTP_USERNAME",""); PASS=os.getenv("SMTP_APP_PASSWORD",""); TO=os.getenv("EMAIL_TO","")
UA={"User-Agent":"Mozilla/5.0","Accept":"application/json,text/plain,*/*"}

def n(v):
    if isinstance(v,dict):v=v.get("raw",v.get("value"))
    if v is None:return None
    try:return float(str(v).replace("$","").replace(",","").replace("%",""))
    except:return None

def yahoo():
    q=EquityQuery("and",[EquityQuery("eq",["region","us"]),EquityQuery("gte",["intradayprice",P_MIN]),EquityQuery("lte",["intradayprice",P_MAX]),EquityQuery("gte",["dayvolume",100000])])
    data=yf.screen(q,size=250,sortField="dayvolume",sortAsc=False); quotes=data.get("quotes",[])
    rows=[]
    for x in quotes:
        p=n(x.get("preMarketPrice")); c=n(x.get("preMarketChangePercent")); v=n(x.get("preMarketVolume"))
        if p is not None and c is not None and v is not None:rows.append((x.get("symbol",""),x.get("shortName") or x.get("symbol",""),p,c,int(v),"Yahoo/yfinance"))
    return rows,len(quotes)

def walk(o,out):
    if isinstance(o,dict):
        if ("symbol" in o or "ticker" in o) and ("lastSalePrice" in o or "price" in o):out.append(o)
        for v in o.values():walk(v,out)
    elif isinstance(o,list):
        for v in o:walk(v,out)

def nasdaq():
    r=requests.get("https://api.nasdaq.com/api/marketmovers",params={"assetclass":"stocks","markettype":"pre"},headers=UA,timeout=20);r.raise_for_status()
    raw=[];walk(r.json(),raw);rows=[]
    for x in raw:
        p=n(x.get("lastSalePrice") or x.get("price"));c=n(x.get("percentageChange") or x.get("percentChange") or x.get("changePercent"));v=n(x.get("volume") or x.get("preMarketVolume"))
        if p is not None and c is not None and v is not None:rows.append((x.get("symbol") or x.get("ticker"),x.get("companyName") or x.get("name") or "",p,c,int(v),"Nasdaq"))
    return rows,len(raw)

def mail(subject,body):
    if DRY:print(subject+"\n"+body);return
    if not USER or not PASS or not TO:print("Email secrets missing",file=sys.stderr);return
    m=EmailMessage();m["Subject"]=subject;m["From"]=USER;m["To"]=TO;m.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com",465,timeout=30) as s:s.login(USER,PASS);s.send_message(m)

def main():
    if datetime.now(TZ).weekday()>=5 and not DRY:return
    errors=[];rows=[];status=""
    try:
        rows,total=yahoo();status="Yahoo/yfinance source="+str(total)+", usable premarket="+str(len(rows))
        if total==0 or len(rows)==0:raise RuntimeError(status)
    except Exception as e:errors.append("Yahoo: "+str(e));rows=[]
    if not rows:
        try:
            rows,total=nasdaq();status="Nasdaq source="+str(total)+", usable premarket="+str(len(rows))
            if total==0 or len(rows)==0:raise RuntimeError(status)
        except Exception as e:errors.append("Nasdaq: "+str(e));rows=[]
    if not rows:
        mail("Premarket Scanner - DATA FEED FAILED","No normal zero-result report was sent. Both feeds failed.\n\n"+" | ".join(errors));raise SystemExit(2)
    picks=[x for x in rows if P_MIN<=x[2]<=P_MAX and x[3]>=MIN_PCT and x[4]>=MIN_VOL]
    picks.sort(key=lambda x:(x[3],x[4]),reverse=True)
    with open("premarket_results.csv","w",newline="") as f:
        w=csv.writer(f);w.writerow(["Ticker","Name","Price (Pre)","% Change (Pre)","Premkt Volume","Source"]);w.writerows(picks)
    body="Feed: "+status+"\nRules: $0.10-$1.00, >=5% premarket, >=1,000,000 shares\n\n"
    if picks:
        for x in picks:body+=x[0]+" | $"+format(x[2],".4f")+" | "+format(x[3],".1f")+"% | vol "+format(x[4],",")+" | "+x[5]+"\n"
    else:body+="No stocks met all filters from a HEALTHY feed.\n"
    mail("Premarket <$1 Scan - "+datetime.now(TZ).strftime("%m/%d/%Y"),body)
    print("Healthy feed; qualified="+str(len(picks)))

if __name__=="__main__":main()
